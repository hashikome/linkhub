import type { Collection, CommentThreads, HubPage, HubSummary, Resource } from "@linkhub/types";
import { collectionPath, permalink, queryValue, withCursor } from "../lib/http";
import { serverRead } from "../lib/server-api";
import { readSession } from "../lib/session";
import { sourcePath } from "../lib/sharing";
import { CollectionContributors } from "./collection-contributors";
import { CollectionFeedback } from "./collection-feedback";
import { CollectionHeading } from "./collection-heading";
import { CollectionSidebar } from "./collection-sidebar";
import { Comments } from "./comments";
import { FormNotice } from "./form-notice";
import { PaginatedList } from "./paginated-list";
import { CollectionMeta, Tags } from "./primitives";
import { ShareAction } from "./share-action";

export async function CollectionReader({
  collection,
  query,
  hub,
  resetPath,
}: {
  collection: Collection;
  query: Record<string, string | string[] | undefined>;
  hub?: HubSummary;
  resetPath?: string;
}) {
  const { id } = collection;
  const path = collectionPath(id);
  const token = queryValue(query.s, 512);
  const itemId = queryValue(query.item);
  const commentCursor = queryValue(query.cc);
  const commentPath = withCursor(`${path}/comments`, commentCursor);
  const replyTo = queryValue(query.rt),
    replyCursor = queryValue(query.rc);
  const replyQuery =
    replyTo && replyCursor ? `&${new URLSearchParams({ replyTo, replyCursor })}` : "";
  const [resources, hubResult, comments, session, item] = await Promise.all([
    serverRead<Resource[]>(withCursor(`${path}/resources`, queryValue(query.cursor)), token),
    hub?.id === collection.hubId
      ? Promise.resolve({ ok: true as const, data: { hub } })
      : serverRead<HubPage>(`/api/v1/hubs/${encodeURIComponent(collection.hubId)}?limit=1`),
    serverRead<CommentThreads>(`${commentPath}${replyQuery}`, token),
    readSession(),
    itemId
      ? serverRead<Resource>(`${path}/resources/${encodeURIComponent(itemId)}`, token)
      : Promise.resolve(null),
  ]);
  if (!resources.ok)
    return <CollectionFeedback error={resources} returnTo={resetPath ?? permalink(id, token)} />;
  const shown = { ...collection, ...(hubResult.ok ? { hub: hubResult.data.hub } : {}) };
  const notice = queryValue(query.notice);
  const discussionNotice = notice?.startsWith("comment") || notice === "comments-off";
  const returnTo = resetPath ?? permalink(id, token);
  const itemContext = new URL(sourcePath(returnTo, query), "http://local.invalid");
  itemContext.searchParams.delete("item");
  const itemBase = itemContext.pathname + itemContext.search;
  const older = comments.ok ? comments.meta?.nextCursor : null;
  const olderHref = older
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}${new URLSearchParams({ cc: older })}#comments`
    : undefined;
  return (
    <div className="reader-layout" data-reader>
      <article className="reader collection-sheet">
        {!discussionNotice && <FormNotice code={notice} />}
        <header className="sheet-bar">
          {hubResult.ok ? (
            <nav className="context" aria-label="Collection context">
              <a href={`/h/${encodeURIComponent(hubResult.data.hub.id)}`}>
                {hubResult.data.hub.name}
              </a>
            </nav>
          ) : (
            <span />
          )}
          <div className="collection-actions">
            <ShareAction
              target={{
                kind: "collection",
                id,
                ...(!collection.published && token ? { token } : {}),
              }}
              returnTo={sourcePath(returnTo, query)}
            />
            {collection.capabilities?.canEdit && (
              <a className="button" href={`/c/${id}/edit`}>
                Edit
              </a>
            )}
          </div>
        </header>
        <CollectionHeading>
          <h1>{collection.title}</h1>
          {collection.description && (
            <div className="collection-overview">
              <div className="collection-overview-content">
                <p className="description">{collection.description}</p>
              </div>
            </div>
          )}
          <Tags tags={collection.tags} limit={3} />
          <CollectionMeta item={shown} />
          {collection.restriction && (
            <p className="form-notice">
              Distribution is on hold ({collection.restriction.reason.replaceAll("_", " ")}). You
              can correct your content.{" "}
              <a href={collection.restriction.supportUrl}>Contact support</a> for review.
            </p>
          )}
        </CollectionHeading>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The resource list scrolls under a fixed header on desktop and needs keyboard focus for scrolling. */}
        <section className="sheet-body" aria-label="Resources" tabIndex={0}>
          {item && !item.ok && (
            <p className="form-notice" role="status">
              {[400, 404].includes(item.status)
                ? "Item unavailable. It may have been removed or isn't in this collection."
                : "Couldn't load this item. Try reloading the collection."}
            </p>
          )}
          <PaginatedList
            kind="resources"
            path={`${path}/resources`}
            initial={resources.data}
            nextCursor={resources.meta?.nextCursor}
            token={token}
            itemBase={itemBase}
            section={resources.meta?.section}
            selectedItem={item?.ok ? item.data : undefined}
          />
        </section>
      </article>
      <CollectionSidebar
        summary={<CollectionContributors contributors={collection.contributors} />}
      >
        <Comments
          collectionId={id}
          threads={comments.ok ? comments.data : null}
          returnTo={returnTo}
          signedIn={Boolean(session)}
          notice={discussionNotice ? notice : undefined}
          olderHref={olderHref}
          commentCursor={commentCursor}
          composerOpen={queryValue(query.compose) === "comment"}
        />
      </CollectionSidebar>
    </div>
  );
}
