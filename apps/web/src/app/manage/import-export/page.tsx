import type { ImportDraftView } from "@ntumie/types";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FormNotice } from "../../../components/form-notice";
import { ImportFileInput } from "../../../components/import-file-input";
import { ImportRefresh } from "../../../components/import-refresh";
import { ImportDiscard } from "../../../components/import-review";
import { NativeForm } from "../../../components/native-form";
import { OperatorFailure } from "../../../components/operator-failure";
import { OperatorTableRegion } from "../../../components/operator-table-region";
import { queryValue } from "../../../lib/http";
import { serverRead } from "../../../lib/server-api";
import { readSession } from "../../../lib/session";
export const metadata: Metadata = { title: "Import · Manage" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (queryValue(query.tab) === "drafts") redirect("/manage/import-export?tab=review");
  const review = queryValue(query.tab) === "review";
  const session = await readSession();
  if (!session)
    redirect(
      `/sign-in?returnTo=${encodeURIComponent(`/manage/import-export${review ? "?tab=review" : ""}`)}`,
    );
  if (!session.hubId)
    return (
      <section className="reader import-page">
        <h1>Bring your links together</h1>
        <p>
          Create your hub before importing a library. You’ll review the links and choose their
          collections before anything is saved.
        </p>
        <FormNotice code={queryValue(query.notice)} />
        <NativeForm action="/forms/import-hub">
          <button className="button primary" type="submit">
            Create hub
          </button>
        </NativeForm>
      </section>
    );
  const result = await serverRead<ImportDraftView[]>("/api/v1/imports");
  if (!result.ok) return <OperatorFailure error={result} />;
  const collections = result.data.flatMap((d) =>
    d.collections.map((c) => ({ draft: d, collection: c })),
  );
  const limit = Math.min(collections.length, Math.max(25, Number(queryValue(query.limit)) || 25));
  return (
    <section className={`reader ops-page import-page${review ? " ops-list-page" : ""}`}>
      <h1>{review ? "Review collections" : "New import"}</h1>
      <p className="meta import-intro">
        {review
          ? "Review a collection, choose whether to publish it, then import its ready links."
          : "Bring bookmarks or a file of links into your collections. Review them before saving."}
      </p>

      <FormNotice code={queryValue(query.notice)} />
      {review ? (
        <OperatorTableRegion label="Collection drafts">
          {collections.length === 0 && (
            <p className="empty">
              No collections to review. <a href="/manage/import-export">Start a new import</a>
            </p>
          )}
          <ImportRefresh
            pending={collections.some(
              ({ collection: c }) =>
                ["queued", "running"].includes(c.jobState) || c.counts.looking_up > 0,
            )}
          />
          <ul className="import-drafts">
            {collections.slice(0, limit).map(({ draft: d, collection: c }) => (
              <li key={c.id}>
                <a href={`/manage/import-export/${d.id}?collection=${c.id}`}>
                  {c.title || "Unfiled links"}
                </a>
                <span className="meta">
                  {c.jobState === "queued"
                    ? "Queued"
                    : c.jobState === "running"
                      ? "Importing"
                      : c.jobState === "failed"
                        ? "Import interrupted"
                        : `${c.counts.ready} ready · ${c.counts.failed} need attention · ${c.counts.imported} imported`}
                  {" · "}
                  {c.saved
                    ? c.published
                      ? "Published"
                      : "Unpublished"
                    : c.published
                      ? "Publish on import"
                      : "Keep unpublished"}
                </span>
                {c.targetCollectionId && <a href={`/c/${c.targetCollectionId}`}>View collection</a>}
                {!["queued", "running"].includes(c.jobState) && (
                  <ImportDiscard draft={{ ...d, collectionId: c.id }} />
                )}
              </li>
            ))}
          </ul>
          {collections.length > limit && (
            <a className="button" href={`/manage/import-export?tab=review&limit=${limit + 25}`}>
              Load more
            </a>
          )}
        </OperatorTableRegion>
      ) : result.data.filter((d) => !d.closed).length < 3 ? (
        <section className="import-start">
          <NativeForm action="/forms/import-start" encType="multipart/form-data">
            <ImportFileInput />
            <button className="button primary" type="submit">
              Review file
            </button>
          </NativeForm>
          <p className="meta">
            <a href="/support/imports">File formats and import guide</a>
          </p>
        </section>
      ) : (
        <p className="notice">
          You have three open drafts.{" "}
          <a href="/manage/import-export?tab=review">Finish or discard a draft</a> before starting
          another.
        </p>
      )}
    </section>
  );
}
