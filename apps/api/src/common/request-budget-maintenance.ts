import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { pruneDeletedAccounts } from "../operations/account-deletion";
import { emitEvent } from "./observability/telemetry";

@Injectable()
export class RequestBudgetMaintenance implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      this.pending ??= this.prune()
        .catch(() => emitEvent("budget.maintenance_failed", {}, "warn"))
        .finally(() => {
          this.pending = undefined;
        });
    }, 60_000);
    this.timer.unref();
  }
  async prune(): Promise<void> {
    await pruneDeletedAccounts(this.prisma);
    await this.prisma.$executeRaw`
      DELETE FROM service_invitations WHERE id IN (
        SELECT id FROM service_invitations WHERE expires_at < clock_timestamp() - interval '30 days'
        ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
      )`;
    await this.prisma.$executeRaw`
      DELETE FROM audit_logs WHERE id IN (
        SELECT id FROM audit_logs WHERE category = 'operation' AND created_at < clock_timestamp() - interval '365 days'
        ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED
      )`;
    await this.prisma.$executeRaw`
      DELETE FROM request_budgets WHERE key IN (
        SELECT key FROM request_budgets WHERE expires_at < clock_timestamp() - interval '1 day'
        ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
      )`;
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.pending;
  }
}
