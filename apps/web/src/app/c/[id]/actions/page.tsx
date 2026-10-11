import type { Collection, CollectionImpact } from "@linkhub/types";
import type { Metadata } from "next";
import { CollectionFeedback } from "../../../../components/collection-feedback";
import { CollectionOperationForm } from "../../../../components/collection-operation-form";
import { FormNotice } from "../../../../components/form-notice";
import { failure, permalink, queryValue } from "../../../../lib/http";
import { serverRead } from "../../../../lib/server-api";
import { shareReturn } from "../../../../lib/sharing";
import { isUuid } from "../../../../lib/validation";
export const metadata: Metadata = {
  title: "Collection action",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params,
    query = await searchParams;
  const action = queryValue(query.action),
    token = queryValue(query.s, 512);
  if (!isUuid(id))
    return <CollectionFeedback error={failure("not_found", 404)} returnTo="/manage/collections" />;
  const result = await serverRead<Collection>(`/api/v1/collections/${id}`, token);
  const back = permalink(id, token);
  if (!result.ok) return <CollectionFeedback error={result} returnTo={back} />;
  const { href: returnTo, label: returnLabel } = shareReturn(queryValue(query.returnTo), back);
  const c = result.data,
    owner = c.capabilities?.canManage;
  if (!owner || !action || !["publish", "unpublish", "delete", "transfer"].includes(action))
    return <CollectionFeedback error={failure("forbidden", 403)} returnTo={back} />;
  const impactResult =
    action === "delete" || action === "transfer"
      ? await serverRead<CollectionImpact>(`/api/v1/collections/${id}/impact?action=${action}`)
      : null;
  if (impactResult && !impactResult.ok)
    return <CollectionFeedback error={impactResult} returnTo={back} />;
  const impact = impactResult?.ok ? impactResult.data : null;
  const titles: Record<string, string> = {
    publish: "Publish collection",
    unpublish: "Unpublish collection",
    delete: "Delete collection",
    transfer: "Transfer ownership",
  };
  return (
    <section className="reader account-flow">
      <nav className="context">
        <a href={back}>{c.title}</a>
      </nav>
      <h1>
        {titles[action]}
        {impact ? `: ${c.title}` : ""}
      </h1>
      <FormNotice code={queryValue(query.notice)} />
      <p>
        {action === "delete"
          ? "Permanently delete this collection, its links and discussion. This cannot be undone."
          : action === "transfer"
            ? "Give ownership to an existing contributor. You will keep contributor access but lose owner controls."
            : action === "publish"
              ? "Make this collection publicly readable and discoverable."
              : "Remove this collection from public view. Direct shares and enabled share links will still work."}
      </p>
      {impact && (
        <section className="collection-impact" aria-labelledby="reference-impact">
          <h2 id="reference-impact">What will change</h2>
          {impact.referenceCount ? (
            <>
              <p>
                {action === "delete"
                  ? "References to this collection will be removed from:"
                  : "Collection references will be removed from these collections so they remain within one owner’s library:"}
              </p>
              <ul className="collection-impact-list">
                {impact.collections.map((affected) => (
                  <li key={affected.collectionId}>
                    <a href={permalink(affected.collectionId)}>{affected.title}</a>
                    <span className="meta">
                      {" "}
                      — {affected.referenceCount}{" "}
                      {affected.referenceCount === 1 ? "reference" : "references"}
                    </span>
                    {affected.removedSections.length > 0 && (
                      <p>
                        Sections left empty will also be removed:{" "}
                        {affected.removedSections.map((section) => section.title).join(", ")}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No references in your collections need to be removed.</p>
          )}
          <p>
            Other collections and their remaining items will be kept. Ordinary web links are
            unchanged.
          </p>
        </section>
      )}
      <CollectionOperationForm
        returnTo={returnTo}
        id={id}
        action={action}
        label={
          action === "delete"
            ? "Yes, delete"
            : action === "transfer"
              ? "Yes, transfer ownership"
              : titles[action]
        }
      >
        {impact && <input type="hidden" name="impactToken" value={impact.token} />}
        {action === "transfer" && (
          <label>
            New owner's email
            <input type="email" name="email" required maxLength={255} />
          </label>
        )}
      </CollectionOperationForm>
      <p>
        <a href={action === "delete" || action === "transfer" ? back : returnTo}>
          {action === "delete" || action === "transfer" ? "Keep collection" : returnLabel}
        </a>
      </p>
    </section>
  );
}
