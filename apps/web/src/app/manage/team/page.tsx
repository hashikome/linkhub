import type { OperatorAccount } from "@ntumie/types";
import type { Metadata } from "next";
import { FormNotice } from "../../../components/form-notice";
import { teamRows } from "../../../components/manage-rows";
import { ManageTable } from "../../../components/manage-table";
import { OperatorFailure } from "../../../components/operator-failure";
import { queryValue, withCursor } from "../../../lib/http";
import { operatorRead } from "../../../lib/operator-read";
import { loadManageRows } from "../load-rows";
export const metadata: Metadata = { title: "Team · Manage" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const team = await operatorRead<OperatorAccount[]>(
    withCursor("/api/v1/operations/operators", queryValue(query.cursor)),
    "/manage/team",
  );
  if (!team.ok) return <OperatorFailure error={team} />;
  return (
    <section className="reader ops-page ops-list-page">
      <h1>Team</h1>
      <p className="meta">Admins and operators who run the service.</p>
      <FormNotice code={queryValue(query.notice)} />
      <ManageTable
        label="Operators"
        headers={
          <tr>
            <th scope="col">Member</th>
            <th scope="col">Role</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        }
        initial={teamRows(team.data)}
        nextCursor={team.meta?.nextCursor}
        href="/manage/team"
        empty={<p className="empty">No operators yet.</p>}
        loadMore={loadManageRows.bind(null, "team", "")}
      />
    </section>
  );
}
