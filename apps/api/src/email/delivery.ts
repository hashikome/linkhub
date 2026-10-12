import { randomUUID } from "node:crypto";
import { UnrecoverableError, Worker } from "bullmq";

import { emitEvent } from "../common/observability/telemetry";
import { ProducerQueue } from "../common/producer-queue";
import type { PrismaClient } from "../generated/prisma/client";
import { type DeliveryPayload, deliveryKey, unseal } from "./outbox";
import { DeliveryError, type EmailProvider } from "./provider";

export class EmailDelivery {
  constructor(
    readonly prisma: PrismaClient,
    private readonly provider: EmailProvider,
    private readonly secret: string,
  ) {}
  async deliver(id: string): Promise<void> {
    const token = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.emailOutbox.updateMany({
      where: {
        id,
        state: "pending",
        payload: { not: null },
        expiresAt: { gt: now },
        availableAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 30_000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const message = await this.prisma.emailOutbox.findUniqueOrThrow({ where: { id } });
    const owns = { id, leaseToken: token, state: "pending" };
    const finish = async (state: string, providerId?: string) =>
      this.prisma.emailOutbox.updateMany({
        // A superseded in-flight send still needs its provider receipt recorded.
        where: { id, leaseToken: token },
        data: { state, providerId, payload: null, leaseToken: null, leaseUntil: null },
      });
    if (
      await this.prisma.emailSuppression.findUnique({
        where: { recipientKey: message.recipientKey },
      })
    ) {
      await finish("suppressed");
      return;
    }
    let payload: DeliveryPayload;
    try {
      payload = unseal(message.payload ?? "", this.secret);
    } catch {
      await finish("failed");
      return;
    }
    let providerId: string;
    try {
      providerId = await this.provider.send(deliveryKey(id), payload, id);
    } catch (error) {
      emitEvent("email.delivery_failed", {}, "warn");
      if ((error instanceof DeliveryError && error.terminal) || message.attempts >= 5)
        await finish("failed");
      else
        await this.prisma.emailOutbox.updateMany({
          where: owns,
          data: {
            leaseToken: null,
            leaseUntil: null,
            availableAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** message.attempts)),
          },
        });
      return;
    }
    // Do not turn bookkeeping failure into a new send. Leave the claim until
    // expiry; recovery reuses the SAME immutable payload and provider key.
    await finish("sent", providerId);
  }
  async maintain() {
    const now = new Date();
    await this.prisma.emailOutbox.updateMany({
      where: {
        state: "pending",
        expiresAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { state: "expired", payload: null, leaseToken: null, leaseUntil: null },
    });
    await this.prisma.emailChangeIntent.deleteMany({ where: { expiresAt: { lte: now } } });
    await this.prisma.verification.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 60_000) } },
    });
    await this.prisma.requestBudget.deleteMany({ where: { expiresAt: { lt: now } } });
    const metadataCutoff = new Date(Date.now() - 30 * 86400_000);
    await this.prisma.emailOutbox.deleteMany({
      where: { state: { not: "pending" }, createdAt: { lt: metadataCutoff } },
    });
    await this.prisma.emailWebhook.deleteMany({ where: { createdAt: { lt: metadataCutoff } } });
    await this.prisma.auditLog.deleteMany({
      where: {
        category: "authentication",
        createdAt: { lt: new Date(Date.now() - 90 * 86400_000) },
      },
    });
  }
}

// BullMQ connection settings for the worker's queues, from one Redis URL.
export function redisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: decodeURIComponent(url.username) || undefined,
    password: decodeURIComponent(url.password) || undefined,
    db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    connectTimeout: 2000,
    retryStrategy: (n: number) => Math.min(n * 200, 2000),
  };
}

export function startEmailQueue(delivery: EmailDelivery, redisUrl: string, prefix: string) {
  const connection = redisConnection(redisUrl);
  const queue = new ProducerQueue("email", {
    connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    prefix,
  });
  const inFlight = new Set<Promise<void>>();
  const worker = new Worker(
    "email",
    async (job) => {
      if (job.name !== "email-v1") return; // DB relay can republish for a newer worker.
      if (
        !job.data ||
        Object.keys(job.data).length !== 1 ||
        typeof job.data.id !== "string" ||
        !/^[0-9a-f-]{36}$/.test(job.data.id)
      )
        throw new UnrecoverableError("Invalid email job");
      const sending = delivery.deliver(job.data.id);
      inFlight.add(sending);
      try {
        await sending;
      } catch {
        // BullMQ persists failedReason/stack in Redis: never pass driver errors.
        throw new Error("Delivery state unavailable");
      } finally {
        inFlight.delete(sending);
      }
    },
    { connection: { ...connection, maxRetriesPerRequest: null }, prefix, concurrency: 4 },
  );
  let lastFailure = 0;
  const reportFailure = () => {
    if (Date.now() - lastFailure > 60_000) {
      lastFailure = Date.now();
      emitEvent("email.relay_failed", {}, "warn");
    }
  };
  queue.on("error", reportFailure);
  worker.on("error", reportFailure);
  worker.on("failed", reportFailure);
  let queueReady = false;
  void queue.client
    .then((client) => {
      queueReady = client.status === "ready";
      client.on("ready", () => {
        queueReady = true;
      });
      client.on("close", () => {
        queueReady = false;
      });
    })
    .catch(() => {});
  let stopping = false;
  let running: Promise<void> | undefined;
  const tick = () => {
    if (stopping || running) return running;
    running = (async () => {
      // Cleanup still runs during Redis loss; outbox never depends on Redis.
      await delivery.maintain();
      if (!queueReady) return;
      const rows = await delivery.prisma.emailOutbox.findMany({
        where: {
          state: "pending",
          expiresAt: { gt: new Date() },
          availableAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        select: { id: true },
        take: 100,
        orderBy: { createdAt: "asc" },
      });
      for (const { id } of rows)
        await queue.add(
          "email-v1",
          { id },
          {
            jobId: id,
            removeOnComplete: true,
            removeOnFail: true,
            attempts: 3,
            backoff: { type: "exponential", delay: 1000 },
          },
        );
    })()
      .catch(reportFailure)
      .finally(() => {
        running = undefined;
      });
    return running;
  };
  const timer = setInterval(() => void tick(), 1000);
  void tick();
  return {
    queue,
    worker,
    tick,
    async close() {
      stopping = true;
      clearInterval(timer);
      // Redis may be down: waiting for BullMQ acknowledgements can hang.
      // Stop queue consumption/connections first, then let bounded provider
      // calls finish database bookkeeping. Unfinished claims recover by lease.
      await worker.close(true);
      await queue.disconnect();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([...(running ? [running] : []), ...inFlight]),
        new Promise<void>((resolve) => {
          deadline = setTimeout(resolve, 6000);
        }),
      ]);
      clearTimeout(deadline);
      await queue.close();
    },
  };
}
