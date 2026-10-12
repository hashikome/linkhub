import type { ImportDraftView, ImportRowView } from "@ntumie/types";
import { importRowStatuses } from "@ntumie/types";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FormNotice } from "../../../../components/form-notice";
import { ImportRefresh } from "../../../../components/import-refresh";
import { ImportRows } from "../../../../components/import-review";
import { OperatorFailure } from "../../../../components/operator-failure";
import { type ApiPath, queryValue } from "../../../../lib/http";
import { importStatusLabels } from "../../../../lib/import-presentation";
import { serverRead } from "../../../../lib/server-api";
import { readSession } from "../../../../lib/session";
import { isUuid } from "../../../../lib/validation";
export const metadata: Metadata = { title: "Review import · Manage" };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const collectionId = queryValue(query.collection);
  if (!isUuid(collectionId)) redirect("/manage/import-export?tab=review");
  const here = `/manage/import-export/${id}?collection=${collectionId}`;
  const session = await readSession();
  const edit = queryValue(query.edit);
  const initialEdit = isUuid(edit) ? edit : undefined;
  const rawStatus = queryValue(query.status),
    status = importRowStatuses.find((s) => s === rawStatus);
  const returnQuery = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(initialEdit ? { edit: initialEdit } : {}),
  });
  if (!session)
    redirect(
      `/sign-in?returnTo=${encodeURIComponent(`${here}${returnQuery.size ? `&${returnQuery}` : ""}`)}`,
    );
  const rowQuery = new URLSearchParams({ limit: "25", collectionId });
  if (status) rowQuery.set("status", status);
  const cursor = queryValue(query.cursor);
  if (cursor) rowQuery.set("cursor", cursor);
  const [result, rowResult] = await Promise.all([
    serverRead<ImportDraftView>(`/api/v1/imports/${id}/collections/${collectionId}`),
    serverRead<ImportRowView[]>(`/api/v1/imports/${id}/rows?${rowQuery}` as ApiPath),
  ]);
  if (!result.ok) {
    if (result.status === 404)
      return (
        <section className="reader import-page">
          <h1>Import no longer available</h1>
          <p>
            The draft expired, was discarded, or belongs to another account. Links already imported
            are still in their collections.
          </p>
          <a href="/manage/import-export?tab=review">Back to review</a>
        </section>
      );
    return <OperatorFailure error={result} />;
  }
  const draft = result.data;
  if (!rowResult.ok) return <OperatorFailure error={rowResult} />;
  let editRow: ImportRowView | undefined;
  if (initialEdit && !rowResult.data.some((r) => r.id === initialEdit)) {
    const edited = await serverRead<ImportRowView>(`/api/v1/imports/${id}/rows/${initialEdit}`);
    if (!edited.ok) return <OperatorFailure error={edited} />;
    if (edited.data.collectionKey === collectionId) editRow = edited.data;
  }
  const collection = draft.collections.find((c) => c.id === collectionId);
  if (!collection) notFound();
  const working = ["queued", "running"].includes(collection.jobState);
  const total = Object.values(draft.counts).reduce((sum, n) => sum + n, 0);
  return (
    <section className="reader ops-page ops-list-page import-page import-review-page">
      <h1>{collection.title || "Unfiled links"}</h1>
      <p className="meta import-intro">
        Review this collection’s links, then import those that are ready.
      </p>
      <div className="import-collection-controls">
        <a href="/manage/import-export?tab=review">All collections to review</a>
        {collection.saved ? (
          <a href={`/c/${collection.targetCollectionId}`}>View collection</a>
        ) : (
          <div className="import-publication">
            <label>
              Publish when imported
              <select
                name="published"
                form="import-collection"
                defaultValue={String(collection.published)}
                disabled={working}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <button
              form="import-collection"
              aria-label="Save publishing choice"
              formAction="/forms/import-publication"
              className="button"
              type="submit"
              disabled={working}
            >
              Save
            </button>
          </div>
        )}
      </div>
      {working && (
        <p role="status" className="notice">
          {collection.jobState === "queued" ? "Import queued." : "Importing this collection."} You
          can review another collection while it finishes.
        </p>
      )}
      {collection.jobState === "failed" && (
        <p role="alert" className="notice">
          Import interrupted. Saved links are safe. Try Import again for the remaining ready links.
        </p>
      )}
      {collection.jobState === "completed" && (
        <p className="meta">
          {draft.counts.imported} links imported. {draft.counts.failed} need attention;{" "}
          {draft.counts.looking_up} processing.
        </p>
      )}
      {collection.references.length > 0 && (
        <p className="meta">
          Related collection drafts:{" "}
          {collection.references.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ", "}
              <a href={`/manage/import-export/${id}?collection=${r.id}`}>{r.title}</a>
            </span>
          ))}
        </p>
      )}
      <FormNotice code={queryValue(query.notice)} />
      <ImportRefresh pending={working || (!draft.closed && draft.counts.looking_up > 0)} />
      <nav className="import-filters import-summary" aria-label="Filter import links">
        <a href={here} aria-current={!status ? "page" : undefined}>
          All <span>{total}</span>
        </a>
        {(
          [
            "looking_up",
            "ready",
            "failed",
            "imported",
            "duplicate",
            "already_saved",
            "skipped",
          ] as const
        )
          .filter(
            (s) =>
              ["looking_up", "ready", "failed"].includes(s) || draft.counts[s] > 0 || status === s,
          )
          .map((s) => (
            <a
              key={s}
              href={`${here}&status=${s}`}
              aria-current={status === s ? "page" : undefined}
            >
              {importStatusLabels[s]} <span>{draft.counts[s]}</span>
            </a>
          ))}
      </nav>
      <ImportRows
        key={`${id}-${status ?? "all"}-${cursor ?? "first"}`}
        draft={draft}
        initialEdit={initialEdit}
        editRow={editRow}
        initial={rowResult.data}
        nextCursor={rowResult.meta?.nextCursor}
        status={status}
        firstPage={!cursor}
      />
    </section>
  );
}
