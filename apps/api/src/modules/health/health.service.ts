import { Injectable } from "@nestjs/common";
import type { DependencyStatus, Health, Readiness, SystemStatus } from "@linkhub/types";
import { PrismaService } from "src/database/prisma.service";
import { emitEvent } from "../../common/observability/telemetry";
import { RedisQueueReadinessService } from "./redis-queue-readiness.service";

@Injectable()
export class HealthService {
  private previousStatus: SystemStatus | undefined;
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisQueue: RedisQueueReadinessService,
  ) {}

  // Liveness: the process is up and serving. No dependency checks.
  health(): Health {
    return { status: "ok" };
  }

  // Readiness: dependency-by-dependency system status.
  async readiness(): Promise<Readiness> {
    const [postgres, redisQueue] = await Promise.allSettled([
      this.prisma.ping(),
      this.redisQueue.ping(),
    ]);

    const dependencies: DependencyStatus = {
      postgres: postgres.status === "fulfilled" ? "ready" : "unavailable",
      redisQueue: redisQueue.status === "fulfilled" ? "ready" : "unavailable",
    };

    // PostgreSQL is authoritative — without it nothing works. The queue Redis
    // only backs future email/notification delivery, so the product remains
    // fully usable without it: degraded, not unavailable.
    let status: SystemStatus;
    if (dependencies.postgres === "unavailable") {
      status = "unavailable";
    } else if (dependencies.redisQueue === "unavailable") {
      status = "degraded";
    } else {
      status = "ready";
    }

    if (status !== this.previousStatus) {
      this.previousStatus = status;
      emitEvent(
        "health.transition",
        { "health.status": status },
        status === "ready" ? "info" : "warn",
      );
    }
    return { status, dependencies };
  }
}
