import type { AuditLogEntry, SessionView } from "@nslinkhub/types";
import type { Metadata } from "next";
import { AuditEvents } from "../../../components/audit-events";
import { AuditFilters } from "../../../components/audit-filters";
import { OperatorFailure } from "../../../components/operator-failure";
import { auditContinuation, auditQuery } from "../../../lib/audit-query";
import type { ApiPath } from "../../../lib/http";
import { operatorRead } from "../../../lib/operator-read";
export const metadata: Metadata = { title: "Audit Log · Manage" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const access = await operatorRead<SessionView>("/api/v1/session", "/manage/audit");
  if (!access.ok) return <OperatorFailure error={access} />;
  const { filters } = auditQuery(query);
  const result = await operatorRead<AuditLogEntry[]>(
    `/api/v1/manage/audit?${filters}` as ApiPath,
    "/manage/audit",
  );
  if (!result.ok) return <OperatorFailure error={result} />;
  const next = auditContinuation(result.meta);
  return (
    <section className="reader ops-page ops-list-page">
      <h1>Audit Log</h1>
      <p className="meta">Recorded activity, changes and results.</p>
      <AuditFilters query={{ ...query, view: result.meta?.auditFilters?.view }} />
      <AuditEvents
        initial={result.data}
        nextCursor={result.meta?.nextCursor}
        filters={next.toString()}
      />
    </section>
  );
}
