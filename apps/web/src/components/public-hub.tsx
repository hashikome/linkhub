import type { HubPage } from "@linkhub/types";
import { PaginatedList } from "./paginated-list";
import { ShareAction } from "./share-action";

export function PublicHub({
  data,
  nextCursor,
  preview = false,
  returnTo,
}: {
  data: HubPage;
  nextCursor?: string | null;
  preview?: boolean;
  returnTo?: string;
}) {
  const { hub, collections } = data;
  const ownerName = hub.ownerName?.trim();
  return (
    <section data-reader className="reader collection-browser public-hub">
      <div className="page-heading hub-heading shareable-heading">
        <div className="hub-introduction">
          <h1>{hub.name}</h1>
          {/* The handle is the hub's; "by Name" only when the owner shows it. */}
          <p className="hub-identity meta">
            <span className="person-handle">@{hub.handle}</span>
            {ownerName && hub.owner && (
              <>
                {" by "}
                <a className="person-name" href={`/${encodeURIComponent(hub.owner.username)}`}>
                  {ownerName}
                </a>
              </>
            )}
          </p>
          {hub.description && <p className="description">{hub.description}</p>}
        </div>
        <ShareAction
          target={{ kind: "hub", id: hub.id }}
          returnTo={returnTo ?? `/h/${hub.id}${preview ? "?view=public" : ""}`}
        />
      </div>
      <div className="hub-collections-heading">
        <h2>Published collections</h2>
        <span className="meta">{hub.publishedCollectionCount}</span>
      </div>
      <PaginatedList
        kind="collections"
        path={`/api/v1/hubs/${encodeURIComponent(hub.id)}`}
        initial={collections}
        nextCursor={nextCursor}
        publicHub={{ handle: hub.handle, preview }}
      />
    </section>
  );
}
