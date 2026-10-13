import type {
  Collection,
  CommentThreads,
  HubPage,
  HubSummary,
  Resource,
  SessionView,
} from "@ntumie/types";
import { Suspense } from "react";
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

export type CollectionReads = ReturnType<typeof startCollectionReads>;

// These reads need only the route ID and share token, so callers start them
// before the collection metadata resolves. Each stays authorized by the API;
// results are discarded unless the collection itself loaded.
export function startCollectionReads(
  id: string,
  query: Record<string, string | string[] | undefined>,
) {
  const path = collectionPath(id);
  const token = queryValue(query.s, 512);
  const itemId = queryValue(query.item);
  const replyTo = queryValue(query.rt),
    replyCursor = queryValue(query.rc);
  const replyQuery =
    replyTo && replyCursor ? `&${new URLSearchParams({ replyTo, replyCursor })}` : "";
  return {
    resources: serverRead<Resource[]>(
      withCursor(`${path}/resources`, queryValue(query.cursor)),
      token,
    ),
    item: itemId
      ? serverRead<Resource>(`${path}/resources/${encodeURIComponent(itemId)}`, token)
      : Promise.resolve(null),
    discussion: serverRead<CommentThreads>(
      `${withCursor(`${path}/comments`, queryValue(query.cc))}${replyQuery}`,
      token,
    ),
  };
}

export async function CollectionReader({
  collection,
  query,
  reads,
  hub,
  resetPath,
}: {
  collection: Collection;
  query: Record<string, string | string[] | undefined>;
  reads: CollectionReads;
  hub?: HubSummary;
  resetPath?: string;
}) {
  const { id } = collection;
  const path = collectionPath(id);
  const token = queryValue(query.s, 512);
  const commentCursor = queryValue(query.cc);
  const replyTo = queryValue(query.rt),
    replyCursor = queryValue(query.rc);
  // Discussion was started alongside resources; never gate links on it.
  const { discussion } = reads;
  const session = readSession();
  const [resources, hubResult, item] = await Promise.all([
    reads.resources,
    hub?.id === collection.hubId
      ? Promise.resolve({ ok: true as const, data: { hub } })
      : serverRead<HubPage>(`/api/v1/hubs/${encodeURIComponent(collection.hubId)}?limit=1`),
    reads.item,
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
          <Tags tags={collection.tags} limit={3} expandable />
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
        <Suspense
          key={`${id}:${token ?? ""}:${commentCursor ?? ""}:${replyTo ?? ""}:${replyCursor ?? ""}`}
          fallback={
            <section className="comments" id="comments" aria-label="Discussion" aria-busy="true">
              <header className="comments-heading">
                <h2>Discussion</h2>
              </header>
              <p className="comments-state" role="status">
                Loading discussion…
              </p>
            </section>
          }
        >
          <CollectionDiscussion
            collectionId={id}
            discussion={discussion}
            session={session}
            returnTo={returnTo}
            notice={discussionNotice ? notice : undefined}
            commentCursor={commentCursor}
            composerOpen={queryValue(query.compose) === "comment"}
          />
        </Suspense>
      </CollectionSidebar>
    </div>
  );
}

async function CollectionDiscussion({
  collectionId,
  discussion,
  session,
  returnTo,
  notice,
  commentCursor,
  composerOpen,
}: {
  collectionId: string;
  discussion: ReturnType<typeof serverRead<CommentThreads>>;
  session: Promise<SessionView | null>;
  returnTo: string;
  notice?: string;
  commentCursor?: string;
  composerOpen: boolean;
}) {
  const [comments, signedIn] = await Promise.all([discussion, session]);
  const older = comments.ok ? comments.meta?.nextCursor : null;
  const olderHref = older
    ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}${new URLSearchParams({ cc: older })}#comments`
    : undefined;
  return (
    <Comments
      collectionId={collectionId}
      threads={comments.ok ? comments.data : null}
      returnTo={returnTo}
      signedIn={Boolean(signedIn)}
      notice={notice}
      olderHref={olderHref}
      commentCursor={commentCursor}
      composerOpen={composerOpen}
    />
  );
}
