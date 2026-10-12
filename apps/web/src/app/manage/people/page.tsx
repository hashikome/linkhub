import type { HubPerson, SessionView } from "@ntumie/types";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { peopleRows } from "../../../components/manage-rows";
import { ManageTable } from "../../../components/manage-table";
import { OperatorFailure } from "../../../components/operator-failure";
import { queryValue, withCursor } from "../../../lib/http";
import { operatorRead } from "../../../lib/operator-read";
import { loadManageRows } from "../load-rows";
export const metadata: Metadata = { title: "Access · Manage" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await operatorRead<SessionView>("/api/v1/session", "/manage/people");
  if (!session.ok) return <OperatorFailure error={session} />;
  if (!session.data.hubId) redirect("/manage");
  const result = await operatorRead<HubPerson[]>(
    withCursor("/api/v1/me/people", queryValue((await searchParams).cursor)),
    "/manage/people",
  );
  if (!result.ok) return <OperatorFailure error={result} />;
  return (
    <section className="reader ops-page ops-list-page">
      <h1>Access</h1>
      <p className="meta">
        People with access to collections in your hub. Manage their access from each collection.
      </p>
      <ManageTable
        label="People with collection access"
        headers={
          <tr>
            <th scope="col">Username</th>
            <th scope="col">Collections</th>
          </tr>
        }
        initial={peopleRows(result.data)}
        nextCursor={result.meta?.nextCursor}
        href="/manage/people"
        empty={<p className="empty">Nobody has been granted access to your collections yet.</p>}
        loadMore={loadManageRows.bind(null, "people", "")}
      />
    </section>
  );
}
