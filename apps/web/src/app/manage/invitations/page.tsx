import { randomUUID } from "node:crypto";
import type { ServiceInvitationView } from "@linkhub/types";
import type { Metadata } from "next";
import { FormNotice } from "../../../components/form-notice";
import { invitationsRows } from "../../../components/manage-rows";
import { ManageTable } from "../../../components/manage-table";
import { NativeForm } from "../../../components/native-form";
import { OperatorFailure } from "../../../components/operator-failure";
import { queryValue, withCursor } from "../../../lib/http";
import { operatorRead } from "../../../lib/operator-read";
import { loadManageRows } from "../load-rows";
export const metadata: Metadata = { title: "Invitations · Manage" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const invitations = await operatorRead<ServiceInvitationView[]>(
    withCursor("/api/v1/operations/operator-invitations", queryValue(query.cursor)),
    "/manage/invitations",
  );
  if (!invitations.ok) return <OperatorFailure error={invitations} />;
  return (
    <section className="reader ops-page ops-list-page">
      <h1>Invitations</h1>
      <p className="meta">
        Invite operators and track service-access invitations. Access begins after verification and
        acceptance.
      </p>
      <FormNotice code={queryValue(query.notice)} />
      <NativeForm action="/forms/invitation-create">
        <input type="hidden" name="operationId" value={randomUUID()} />
        <div className="ops-filters">
          <label className="ops-search">
            <span className="sr-only">Operator's email</span>
            <input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="Operator's email"
            />
          </label>
          <button type="submit" className="button">
            Invite operator
          </button>
        </div>
      </NativeForm>

      <ManageTable
        label="Invitations"
        headers={
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Status</th>
            <th scope="col">Delivery</th>
            <th scope="col">Expires</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        }
        initial={invitationsRows(invitations.data)}
        nextCursor={invitations.meta?.nextCursor}
        href="/manage/invitations"
        empty={<p className="empty">No invitations yet.</p>}
        loadMore={loadManageRows.bind(null, "invitations", "")}
      />
    </section>
  );
}
