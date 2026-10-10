import type { Collection, Resource } from "@nslinkhub/types";
import type { Metadata } from "next";
import { CollectionFeedback } from "../../../../components/collection-feedback";
import { SectionEditor } from "../../../../components/section-editor";
import { failure, queryValue, withCursor } from "../../../../lib/http";
import { saveSection } from "../../../../lib/section-actions";
import { serverRead } from "../../../../lib/server-api";
import { isUuid } from "../../../../lib/validation";
export const metadata: Metadata = { title: "Section" };
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
  const sectionId = queryValue(query.section);
  const cursor = queryValue(query.cursor);
  const path = `/c/${id}/sections${sectionId ? `?section=${encodeURIComponent(sectionId)}` : ""}`;
  const missing = <CollectionFeedback error={failure("not_found", 404)} returnTo={path} />;
  if (!isUuid(id) || (sectionId && !isUuid(sectionId))) return missing;
  const collection = await serverRead<Collection>(`/api/v1/collections/${id}`);
  if (!collection.ok) return <CollectionFeedback error={collection} returnTo={path} />;
  if (!collection.data.capabilities?.canEdit) return missing;
  const section = sectionId
    ? await serverRead<Resource>(`/api/v1/collections/${id}/resources/${sectionId}`)
    : null;
  if (section && (!section.ok || section.data.kind !== "heading")) return missing;
  const items = await serverRead<Resource[]>(
    withCursor(`/api/v1/collections/${id}/resources`, cursor),
  );
  if (!items.ok) return <CollectionFeedback error={items} returnTo={path} />;
  return (
    <section className="reader account-flow edit-page">
      <nav className="context">
        <a href={`/c/${id}`}>{collection.data.title}</a>
      </nav>
      <h1>{section ? "Edit section" : "Add section"}</h1>
      {section || items.data.some((item) => item.kind !== "heading") ? (
        <SectionEditor
          collectionId={id}
          formPath={!section && cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path}
          section={section?.ok ? section.data : undefined}
          items={items.data}
          saveAction={saveSection}
        />
      ) : (
        <p>
          Add an item before creating a section.{" "}
          {collection.data.capabilities.canManage && (
            <a href={`/capture?collection=${id}`}>Add a link</a>
          )}
        </p>
      )}
      {!section && items.meta?.nextCursor && (
        <a className="button" href={`${path}?cursor=${encodeURIComponent(items.meta.nextCursor)}`}>
          More items
        </a>
      )}
    </section>
  );
}
