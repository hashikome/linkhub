import "server-only";
import type { CursorMeta } from "@nslinkhub/types";
import { queryValue } from "./http";

export function auditQuery(query: Record<string, string | string[] | undefined>) {
  const filters = new URLSearchParams({ limit: "20", view: queryValue(query.view) ?? "actions" });
  for (const key of ["q", "actor", "targetId", "hub", "action", "from", "to", "cursor"]) {
    const value = queryValue(
      key === "from" || key === "to" ? (query[`${key}Instant`] ?? query[key]) : query[key],
      key === "cursor" ? 4096 : key === "q" ? 200 : 64,
    );
    if (!value) continue;
    filters.set(
      key,
      (key === "from" || key === "to") && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T${key === "from" ? "00:00:00.000" : "23:59:59.999"}Z`
        : value,
    );
  }
  return { filters };
}
export function auditContinuation(meta?: CursorMeta) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(meta?.auditFilters ?? {}))
    if (value) next.set(key, value);
  return next;
}
