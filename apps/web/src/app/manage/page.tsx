import type { OperatorAccount, SessionView } from "@nslinkhub/types";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormNotice } from "../../components/form-notice";
import { accountsRows } from "../../components/manage-rows";
import { ManageTable } from "../../components/manage-table";
import { OperatorFailure } from "../../components/operator-failure";
import { OperatorNav } from "../../components/operator-ui";
import { type ApiPath, queryValue } from "../../lib/http";
import { openSearch } from "../../lib/manage-search";
import { operatorRead } from "../../lib/operator-read";
import { loadManageRows } from "./load-rows";
export const metadata: Metadata = { title: "Accounts · Manage" };
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await operatorRead<SessionView>("/api/v1/session", "/manage");
  if (!access.ok) return <OperatorFailure error={access} />;
  if (!access.data.operator) redirect("/manage/collections");
  const query = await searchParams;
  const sealed = queryValue(query.s) ?? "";
  const q = openSearch(sealed);
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const cursor = queryValue(query.cursor);
  if (cursor) params.set("cursor", cursor);
  const result = await operatorRead<OperatorAccount[]>(
    `/api/v1/operations/accounts${params.size ? `?${params}` : ""}` as ApiPath,
    "/manage",
  );
  if (!result.ok) return <OperatorFailure error={result} />;
  const here = `/manage${q ? `?${new URLSearchParams({ s: sealed })}` : ""}`;
  return (
    <section className="reader ops-page ops-list-page ops-accounts">
      <OperatorNav current="accounts" />
      <h1>Accounts</h1>
      <p className="meta">
        Find people by user ID, username, email or hub handle. Every action is recorded.
      </p>
      <FormNotice code={queryValue(query.notice)} />
      <form method="post" action="/forms/manage-search" className="ops-filters">
        <input type="hidden" name="page" value="accounts" />
        <label className="ops-search">
          <span className="sr-only">User ID, username, email or hub handle</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={254}
            placeholder="User ID, username, email or @handle"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="button">
          Search
        </button>
        {q && (
          <a href="/manage" className="ops-clear">
            Clear
          </a>
        )}
      </form>
      <ManageTable
        label="Accounts"
        headers={
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Member since</th>
            <th scope="col">Last login</th>
            <th scope="col">Sessions</th>
          </tr>
        }
        initial={accountsRows(result.data)}
        nextCursor={result.meta?.nextCursor}
        href={here}
        empty={<p className="empty">{q ? `No account matches “${q}”.` : "No accounts yet."}</p>}
        loadMore={loadManageRows.bind(null, "accounts", sealed)}
      />
    </section>
  );
}
