import {
  auditActionLabels,
  auditOutcomeLabels,
  auditReadActions,
  auditStateLabels,
} from "@ntumie/types";
import { Prisma } from "../generated/prisma/client";
import type { auditPage, resolveAuditFilters } from "./audit-query";

// Shared labels keep search aligned with what the reader displays. User input
// stays in bound parameters, including literal '%' and '_' characters.
function label(column: Prisma.Sql, labels: Record<string, string>) {
  return Prisma.sql`COALESCE(${JSON.stringify(labels)}::jsonb ->> ${column}, ${column})`;
}

export async function auditSearchIds(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  filters: Awaited<ReturnType<typeof resolveAuditFilters>>,
  page: ReturnType<typeof auditPage>,
  access: Prisma.Sql,
): Promise<string[]> {
  if (!access) throw new Error("Audit search requires authorization");
  const target = Prisma.sql`CASE
    WHEN a.action LIKE 'invitation.%' OR a.action LIKE 'admin.%' THEN a.invitation_id
    WHEN a.action LIKE 'item.%' THEN a.resource_id
    WHEN a.action LIKE 'hub.%' THEN a.hub_id
    WHEN a.action ~ '^(collection[.]|items[.]|share[.]|link[.])' THEN a.collection_id
    WHEN a.action ~ '^(account[.]|accounts.lookup|sessions[.]|operator[.])' OR a.category = 'authentication' THEN a.target_user_id
    ELSE NULL::uuid END`;
  const read = Prisma.sql`a.action IN (${Prisma.join([...auditReadActions])})`;
  const actorFallback = Prisma.sql`COALESCE(a.authority, a.actor_kind)`;
  const state = Prisma.sql`concat_ws(' → ',
    ${label(Prisma.sql`a.before_state`, auditStateLabels)},
    ${label(Prisma.sql`a.after_state`, auditStateLabels)})`;
  const text = Prisma.sql`lower(concat_ws(' ',
    u.username, COALESCE(a.actor_user_id::text, ${actorFallback}),
    ${label(Prisma.sql`a.action`, auditActionLabels)},
    COALESCE((${target})::text, CASE WHEN ${read} THEN 'No individual target' ELSE 'Not recorded' END),
    COALESCE(${label(Prisma.sql`a.outcome`, auditOutcomeLabels)}, 'Not recorded'),
    CASE WHEN a.action = 'sessions.revoke' THEN 'Session count not recorded'
      WHEN a.action LIKE 'collection.transferred_%' THEN concat('Hub ', ${state})
      WHEN a.before_state IS NULL AND a.after_state IS NOT NULL THEN concat('Resulting state: ', ${state})
      ELSE ${state} END,
    CASE WHEN ${read} THEN 'Read only'
      WHEN a.before_state IS NULL AND a.after_state IS NULL AND a.action <> 'sessions.revoke' THEN 'Not recorded' END,
    CASE WHEN a.action LIKE 'share.%' THEN concat('Access for ', a.target_user_id::text) END,
    CASE WHEN a.action = 'link.rotated' AND a.outcome = 'success' THEN
      CASE WHEN a.before_state = 'enabled' THEN 'Previous share link invalidated' ELSE 'New share link issued' END END,
    CASE WHEN a.reason IS NOT NULL THEN concat('Reason: ', replace(a.reason, '_', ' ')) END,
    CASE WHEN a.outcome IS NULL AND a.role = 'viewer' THEN 'Recorded access: Viewer' WHEN a.outcome IS NULL AND a.role = 'contributor' THEN 'Recorded access: Contributor' END
  ))`;
  const conditions: Prisma.Sql[] = [access, Prisma.sql`a.created_at <= ${new Date(page.cutoff)}`];
  if (filters.hub) conditions.push(Prisma.sql`a.hub_id = ${filters.hub}::uuid`);
  if (filters.actor) conditions.push(Prisma.sql`a.actor_user_id = ${filters.actor}::uuid`);
  if (filters.targetId)
    conditions.push(
      Prisma.sql`${filters.targetId}::uuid IN (a.target_user_id, a.collection_id, a.invitation_id, a.resource_id, a.hub_id)`,
    );
  if (filters.action) conditions.push(Prisma.sql`a.action = ${filters.action}`);
  else if (filters.view === "actions")
    conditions.push(Prisma.sql`NOT (${read} AND (a.outcome IS NULL OR a.outcome = 'success'))`);
  if (filters.from) conditions.push(Prisma.sql`a.created_at >= ${new Date(filters.from)}`);
  if (filters.to) conditions.push(Prisma.sql`a.created_at <= ${new Date(filters.to)}`);
  if (page.cursor)
    conditions.push(
      Prisma.sql`(a.created_at, a.id) < (${page.cursor.at}::timestamptz, ${page.cursor.id}::uuid)`,
    );
  for (const term of filters.q?.split(/\s+/) ?? [])
    conditions.push(Prisma.sql`strpos(${text}, ${term}) > 0`);
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT a.id FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE ${Prisma.join(conditions, " AND ")}
    ORDER BY a.created_at DESC, a.id DESC LIMIT ${page.limit + 1}
  `);
  return rows.map((row) => row.id);
}
