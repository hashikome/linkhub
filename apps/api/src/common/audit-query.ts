import { createHash } from "node:crypto";
import { auditReadActions } from "@ntumie/types";
import { isUUID } from "class-validator";
import type { PrismaService } from "../database/prisma.service";
import type { AuditLogQueryDto } from "./dto/audit-query.dto";
import { appError } from "./errors/app-exception";
import { decodeCursor, encodeCursor } from "./utils/cursor.util";

const missingId = "00000000-0000-0000-0000-000000000000";
export async function resolveAuditFilters(prisma: PrismaService, query: AuditLogQueryDto) {
  const actor = query.actor?.toLowerCase();
  const hub = query.hub?.toLowerCase().replace(/^@/, "");
  const q = query.q?.trim().toLowerCase() || undefined;
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to))
    throw appError("bad_request");
  return {
    q,
    // An explicit read-action search must remain discoverable from either view.
    view:
      query.action && (auditReadActions as readonly string[]).includes(query.action)
        ? ("all" as const)
        : (query.view ?? "all"),
    actor: actor
      ? isUUID(actor)
        ? actor
        : ((await prisma.user.findUnique({ where: { username: actor }, select: { id: true } }))
            ?.id ?? missingId)
      : undefined,
    hub: hub
      ? isUUID(hub)
        ? hub
        : ((await prisma.hub.findUnique({ where: { handle: hub }, select: { id: true } }))?.id ??
          missingId)
      : undefined,
    targetId: query.targetId?.toLowerCase(),
    action: query.action,
    from: query.from,
    to: query.to,
  };
}
export function auditPage(query: AuditLogQueryDto, scope: string) {
  const key = createHash("sha256").update(scope).digest("hex");
  const cursor = query.cursor
    ? decodeCursor<{ id: string; at: string; cutoff: string; scope: string }>(query.cursor)
    : null;
  if (
    query.cursor &&
    (!cursor ||
      !isUUID(cursor.id ?? "") ||
      cursor.scope !== key ||
      !Number.isFinite(Date.parse(cursor.at)) ||
      !Number.isFinite(Date.parse(cursor.cutoff)) ||
      Date.parse(cursor.cutoff) > Date.now() ||
      Date.parse(cursor.at) > Date.parse(cursor.cutoff))
  )
    throw appError("invalid_cursor");
  const cutoff = cursor?.cutoff ?? new Date().toISOString();
  return {
    cursor,
    limit: query.limit ?? 20,
    cutoff,
    scope: key,
  };
}
export async function auditResult<T extends { id: string; createdAt: string }>(
  db: Pick<PrismaService, "$queryRaw">,
  rows: T[],
  page: ReturnType<typeof auditPage>,
  filters: Awaited<ReturnType<typeof resolveAuditFilters>>,
) {
  const items = rows.slice(0, page.limit),
    last = items.at(-1);
  // Preserve PostgreSQL microseconds for keyset pagination; JS Date truncates them.
  const [timestamp] =
    rows.length > page.limit && last
      ? await db.$queryRaw<{ at: string }[]>`
        SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
        FROM audit_logs WHERE id = ${last.id}::uuid`
      : [];
  return {
    items,
    meta: {
      limit: page.limit,
      auditFilters: filters,
      nextCursor:
        timestamp && last
          ? encodeCursor({
              id: last.id,
              at: timestamp.at,
              cutoff: page.cutoff,
              scope: page.scope,
            })
          : null,
    },
  };
}
export async function auditUsernames(
  prisma: PrismaService,
  rows: { actorUserId: string | null; targetUserId: string | null }[],
) {
  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.actorUserId, r.targetUserId]).filter((id): id is string => !!id),
    ),
  ];
  return new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, username: true },
      })
    ).map((u) => [u.id, u.username]),
  );
}
