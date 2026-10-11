import type { Collection, Resource } from "@linkhub/types";
import type { Metadata } from "next";
import { CollectionFeedback } from "../../../../components/collection-feedback";
import { FormNotice } from "../../../../components/form-notice";
import { ReorderItems } from "../../../../components/reorder-items";
import { failure, queryValue, withCursor } from "../../../../lib/http";
import { moveItem } from "../../../../lib/reorder-actions";
import { serverRead } from "../../../../lib/server-api";
import { isUuid } from "../../../../lib/validation";
export const metadata: Metadata = { title: "Reorder items" };
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
  const path = `/c/${id}/reorder`;
  const missing = <CollectionFeedback error={failure("not_found", 404)} returnTo={path} />;
  if (!isUuid(id)) return missing;
  const collection = await serverRead<Collection>(`/api/v1/collections/${id}`);
  if (!collection.ok) return <CollectionFeedback error={collection} returnTo={path} />;
  if (!collection.data.capabilities?.canEdit) return missing;
  const cursor = queryValue(query.cursor);
  const items = await serverRead<Resource[]>(
    withCursor(`/api/v1/collections/${id}/resources`, cursor),
  );
  if (!items.ok) return <CollectionFeedback error={items} returnTo={path} />;
  return (
    <section className="reader account-flow edit-page">
      <nav className="context">
        <a href={`/c/${id}`}>{collection.data.title}</a>
      </nav>
      <h1>Reorder items</h1>
      <p>
        Move items up or down, or drag a title before another item. Moving a section moves its items
        too. Each move saves immediately.
      </p>
      <p className="field-help">
        Every section needs at least one item. Move up and Move down also work across pages.
      </p>
      <FormNotice code={queryValue(query.notice)} />
      <ReorderItems items={items.data} collectionId={id} cursor={cursor} moveAction={moveItem} />
      <div className="form-actions">
        {cursor && (
          <a className="button" href={path}>
            First items
          </a>
        )}
        {items.meta?.nextCursor && (
          <a
            className="button"
            href={`${path}?cursor=${encodeURIComponent(items.meta.nextCursor)}`}
          >
            More items
          </a>
        )}
        <a className="button" href={`/c/${id}`}>
          Done
        </a>
      </div>
    </section>
  );
}
