import type { Collection, Resource } from "@ntumie/types";
import type { Metadata } from "next";
import { CollectionEditForm } from "../../../../components/collection-editor";
import { CollectionFeedback } from "../../../../components/collection-feedback";
import { PaginatedList } from "../../../../components/paginated-list";
import { saveCollection } from "../../../../lib/collection-actions";
import { collectionPath, failure, permalink, queryValue, withCursor } from "../../../../lib/http";
import { serverRead } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "Edit collection" };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const unavailable = (
    <CollectionFeedback error={failure("not_found", 404)} returnTo={permalink(id)} />
  );
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
    return unavailable;
  const result = await serverRead<Collection>(collectionPath(id));
  if (!result.ok) return <CollectionFeedback error={result} returnTo={`/c/${id}/edit`} />;
  // The API owns the capability; this only avoids showing a form that would be refused.
  if (!result.data.capabilities?.canEdit) return unavailable;
  const query = await searchParams;
  const resources = await serverRead<Resource[]>(
    withCursor(`${collectionPath(id)}/resources`, queryValue(query.cursor)),
  );
  if (!resources.ok) return <CollectionFeedback error={resources} returnTo={`/c/${id}/edit`} />;
  return (
    <section className="reader account-flow edit-page collection-workspace">
      <nav className="context" aria-label="Collection context">
        <a href={permalink(id)}>{result.data.title}</a>
      </nav>
      <h1>Edit collection</h1>
      <nav className="edit-navigation" aria-label="Collection editing">
        {result.data.capabilities.canManage && <a href="#collection-details">Details</a>}
        <a href="#collection-items">Items and sections</a>
        <a href={`/c/${id}/history`}>History</a>
      </nav>
      {result.data.capabilities.canManage && (
        <section id="collection-details" aria-labelledby="details-heading">
          <h2 id="details-heading">Collection details</h2>
          <CollectionEditForm collection={result.data} saveAction={saveCollection} />
        </section>
      )}
      <section id="collection-items" aria-labelledby="items-heading">
        <h2 id="items-heading">Items and sections</h2>
        <nav className="section-controls" aria-label="Item editing">
          <a className="button" href={`/capture?collection=${id}`}>
            Add a link
          </a>
          {resources.data.length > 0 && (
            <a className="button" href={`/c/${id}/reorder`}>
              Reorder
            </a>
          )}
          <a className="button" href={`/c/${id}/sections`}>
            Add section
          </a>
        </nav>
        <PaginatedList
          kind="resources"
          path={`${collectionPath(id)}/resources`}
          initial={resources.data}
          nextCursor={resources.meta?.nextCursor}
          section={resources.meta?.section}
          itemBase={permalink(id)}
          collectionId={id}
          canEdit
        />
      </section>
    </section>
  );
}
