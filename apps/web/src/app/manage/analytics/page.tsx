import type { ShareAnalytics, ShareKind } from "@nslinkhub/types";
import type { Metadata } from "next";
import { LocalTime } from "../../../components/local-time";
import { OperatorFailure } from "../../../components/operator-failure";
import { operatorRead } from "../../../lib/operator-read";

export const metadata: Metadata = { title: "Analytics · Manage" };
export const dynamic = "force-dynamic";

const kinds: Record<ShareKind, string> = {
  collection: "Collections",
  hub: "Hubs",
  profile: "Profiles",
  site: "Site",
};
const number = (value: number) => value.toLocaleString("en-GB");

function Breakdown({
  label,
  rows,
}: {
  label: string;
  rows: { key: string; label: string; count: number; opens: number }[];
}) {
  return (
    <table className="ops-table analytics-table" aria-label={`Sharing by ${label.toLowerCase()}`}>
      <thead>
        <tr>
          <th scope="col">{label}</th>
          <th scope="col">Share requests</th>
          <th scope="col">Reported opens</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td data-label={label}>{row.label}</td>
            <td data-label="Share requests">{number(row.count)}</td>
            <td data-label="Reported opens">{number(row.opens)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function Page() {
  const result = await operatorRead<ShareAnalytics>(
    "/api/v1/share/analytics?scope=service",
    "/manage/analytics",
  );
  if (!result.ok) return <OperatorFailure error={result} returnTo="/manage/analytics" />;
  const data = result.data;
  return (
    <section className="reader ops-page analytics-page">
      <h1>Analytics</h1>
      <p className="meta">Sharing across the service, all time.</p>
      <div className="analytics-refresh">
        <form action="/manage/analytics" method="get">
          <button className="button" type="submit">
            Refresh
          </button>
        </form>
        <p className="meta">
          Updated <LocalTime at={new Date().toISOString()} />
        </p>
      </div>
      <dl className="analytics-totals" aria-label="Sharing totals">
        <div>
          <dt>Share requests</dt>
          <dd data-metric="shares">{number(data.total)}</dd>
        </div>
        <div>
          <dt>Reported opens</dt>
          <dd data-metric="opens">{number(data.opens)}</dd>
        </div>
      </dl>
      <p className="meta">
        Opens count successful page loads reported by clients, including repeat visits.
      </p>
      {data.total === 0 ? (
        <p className="empty">
          No shares recorded yet. Copy a link while signed in, open it, then refresh to see the
          activity.
        </p>
      ) : (
        <div className="analytics-breakdowns">
          <section aria-labelledby="analytics-kind">
            <h2 id="analytics-kind" className="ops-section-title">
              By resource
            </h2>
            <Breakdown
              label="Resource"
              rows={data.byKind.map((row) => ({ ...row, key: row.kind, label: kinds[row.kind] }))}
            />
          </section>
          <section aria-labelledby="analytics-destination">
            <h2 id="analytics-destination" className="ops-section-title">
              By destination
            </h2>
            <Breakdown
              label="Destination"
              rows={data.byDestination.map((row) => ({
                ...row,
                key: JSON.stringify(row.destination),
                label:
                  row.destination === null
                    ? "Not specified"
                    : row.destination === "copy_link"
                      ? "Copy link"
                      : row.destination,
              }))}
            />
            {data.otherDestinationCount > 0 && (
              <p className="meta">
                Top 100 destinations shown. {number(data.otherDestinationCount)} share requests used
                other destinations.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
