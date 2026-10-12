import type { AuditLogEntry } from "@ntumie/types";
import { auditQuery } from "../../../../lib/audit-query";
import { serverRead } from "../../../../lib/server-api";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const { filters } = auditQuery(Object.fromEntries(params));
  const result = await serverRead<AuditLogEntry[]>(`/api/v1/manage/audit?${filters}`);
  return Response.json(
    result.ok ? { data: result.data, meta: result.meta } : { error: { code: result.code } },
    {
      status: result.ok ? 200 : result.status || 502,
      headers: {
        "Cache-Control": "private, no-store",
        ...(!result.ok && result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}),
      },
    },
  );
}
