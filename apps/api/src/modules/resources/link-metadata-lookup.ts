import { randomUUID } from "node:crypto";
import { UnrecoverableError, Worker } from "bullmq";

import { emitEvent } from "../../common/observability/telemetry";
import { ProducerQueue } from "../../common/producer-queue";
import { redisConnection } from "../../email/delivery";
import type { PrismaClient } from "../../generated/prisma/client";
import { FAILED_RETRY_MS } from "./link-metadata";
import { fetchPageMetadata, type PageMetadata } from "./page-metadata";

// Worker side of link metadata (see link-metadata.ts): pending rows are claimed
// with a lease, the page is fetched outside any transaction, and the row
// becomes ready or is retried with backoff. Mirrors the email outbox.

/** Retry delays after a failed lookup; after the last one the row is failed. */
export const RETRY_DELAYS_MS = [60_000, 600_000, 3_600_000, 21_600_000];
const LEASE_MS = 30_000;
const HOST_SPACING_MS = 1000;

type Fetch = (url: string) => Promise<PageMetadata | null>;

export class LinkMetadataLookup {
  private readonly lastByHost = new Map<string, number>();

  constructor(
    readonly prisma: PrismaClient,
    private readonly fetch: Fetch = (url) => fetchPageMetadata(url),
  ) {}

  async lookup(id: string): Promise<void> {
    const token = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.linkMetadata.updateMany({
      where: {
        id,
        state: "pending",
        availableAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: {
        leaseToken: token,
        leaseUntil: new Date(Date.now() + LEASE_MS),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const row = await this.prisma.linkMetadata.findUniqueOrThrow({ where: { id } });
    await this.politely(row.url);
    let page: PageMetadata | null = null;
    try {
      page = await this.fetch(row.url);
    } catch {
      page = null;
    }
    const owns = { id, leaseToken: token };
    if (page) {
      await this.prisma.linkMetadata.updateMany({
        where: owns,
        data: {
          ...page,
          state: "ready",
          fetchedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      return;
    }
    const retry = RETRY_DELAYS_MS[row.attempts - 1];
    await this.prisma.linkMetadata.updateMany({
      where: owns,
      data:
        retry === undefined
          ? {
              // Due again a day later, when a read of its collection retries it.
              state: "failed",
              availableAt: new Date(Date.now() + FAILED_RETRY_MS),
              leaseToken: null,
              leaseUntil: null,
            }
          : { availableAt: new Date(Date.now() + retry), leaseToken: null, leaseUntil: null },
    });
    if (retry === undefined) emitEvent("link_metadata.failed", {}, "info");
  }

  // At most one request per site per second from this worker.
  private async politely(url: string) {
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return;
    }
    const wait = (this.lastByHost.get(host) ?? 0) + HOST_SPACING_MS - Date.now();
    this.lastByHost.set(host, Date.now() + Math.max(0, wait));
    if (this.lastByHost.size > 5000)
      for (const [key, at] of this.lastByHost)
        if (at < Date.now() - HOST_SPACING_MS) this.lastByHost.delete(key);
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  }
}

export function startLinkMetadataQueue(
  lookup: LinkMetadataLookup,
  redisUrl: string,
  prefix: string,
) {
  const connection = redisConnection(redisUrl);
  const queue = new ProducerQueue("link-metadata", {
    connection: { ...connection, maxRetriesPerRequest: 1, enableOfflineQueue: false },
    prefix,
  });
  const inFlight = new Set<Promise<void>>();
  const worker = new Worker(
    "link-metadata",
    async (job) => {
      if (job.name !== "link-metadata-v1") return;
      if (
        !job.data ||
        Object.keys(job.data).length !== 1 ||
        typeof job.data.id !== "string" ||
        !/^[0-9a-f-]{36}$/.test(job.data.id)
      )
        throw new UnrecoverableError("Invalid link metadata job");
      const running = lookup.lookup(job.data.id);
      inFlight.add(running);
      try {
        await running;
      } catch {
        throw new Error("Link metadata state unavailable");
      } finally {
        inFlight.delete(running);
      }
    },
    { connection: { ...connection, maxRetriesPerRequest: null }, prefix, concurrency: 4 },
  );
  let lastFailure = 0;
  const reportFailure = () => {
    if (Date.now() - lastFailure > 60_000) {
      lastFailure = Date.now();
      emitEvent("link_metadata.relay_failed", {}, "warn");
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
      if (!queueReady) return;
      const now = new Date();
      const rows = await lookup.prisma.linkMetadata.findMany({
        where: {
          state: "pending",
          availableAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        select: { id: true },
        take: 100,
        orderBy: { availableAt: "asc" },
      });
      for (const { id } of rows)
        await queue.add(
          "link-metadata-v1",
          { id },
          { jobId: `${id}`, removeOnComplete: true, removeOnFail: true },
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
