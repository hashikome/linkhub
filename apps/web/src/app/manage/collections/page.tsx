import type { ManagedCollection, SessionView } from "@ntumie/types";
import type { Metadata } from "next";
import { FormNotice } from "../../../components/form-notice";
import { managedCollectionsRows } from "../../../components/manage-rows";
import { ManageTable } from "../../../components/manage-table";
import { OperatorFailure } from "../../../components/operator-failure";
import { queryValue, withCursor } from "../../../lib/http";
import { operatorRead } from "../../../lib/operator-read";
import { loadManageRows } from "../load-rows";
export const metadata: Metadata = { title: "Collections · Manage" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const session = await operatorRead<SessionView>("/api/v1/session", "/manage/collections");
  if (!session.ok) return <OperatorFailure error={session} />;
  const q = (queryValue(query.q) ?? queryValue(query.link) ?? "").trim().slice(0, 2048);
  const filters = new URLSearchParams(q ? { q } : {});
  const result = await operatorRead<ManagedCollection[]>(
    withCursor(`/api/v1/manage/collections?${filters}`, queryValue(query.cursor)),
    "/manage/collections",
  );
  if (!result.ok) return <OperatorFailure error={result} />;
  const returnQuery = new URLSearchParams(filters);
  const cursor = queryValue(query.cursor);
  if (cursor) returnQuery.set("cursor", cursor);
  const returnTo = `/manage/collections${returnQuery.size ? `?${returnQuery}` : ""}`;
  return (
    <section className="reader ops-page ops-list-page">
      <h1>Collections</h1>
      <p className="meta">
        Find a collection by its ID or link. Available actions depend on your access.
      </p>
      <FormNotice code={queryValue(query.notice)} />
      <form method="get" action="/manage/collections" className="ops-filters">
        <label className="ops-search">
          <span className="sr-only">Collection ID or link</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={2048}
            placeholder="Collection ID or link"
            autoComplete="off"
          />
        </label>
        <button className="button" type="submit">
          Search
        </button>
        {q && <a href="/manage/collections">Clear</a>}
      </form>
      <ManageTable
        key={q}
        label="Collections"
        headers={
          <tr>
            <th scope="col">Collection</th>
            <th scope="col">Hub</th>
            <th scope="col">Visibility</th>
            <th scope="col">Status</th>
            <th scope="col">Updated</th>
          </tr>
        }
        initial={managedCollectionsRows(result.data, returnTo)}
        nextCursor={result.meta?.nextCursor}
        href={`/manage/collections?${filters}`}
        empty={
          <p className="empty">
            {q ? "No accessible collection matches that ID or link." : "No collections available."}
          </p>
        }
        loadMore={loadManageRows.bind(null, "managed-collections", q)}
      />
    </section>
  );
}
