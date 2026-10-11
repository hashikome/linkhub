import type { Collection, Profile } from "@linkhub/types";
import { withCursor } from "../lib/http";
import { operatorRead } from "../lib/operator-read";
import { Feedback } from "./feedback";
import { PaginatedList } from "./paginated-list";
import { ShareAction } from "./share-action";
export async function OwnedHub({
  profile,
  cursor,
  returnTo,
}: {
  profile: Profile;
  cursor?: string;
  returnTo?: string;
}) {
  const result = await operatorRead<Collection[]>(
    withCursor(`/api/v1/hubs/${profile.hubId}/collections`, cursor),
    `/h/${profile.hubId}`,
  );
  if (!result.ok) return <Feedback error={result} resetPath={`/h/${profile.hubId}`} />;
  const hub = profile;
  const ownerName = hub.showOwner ? hub.displayName.trim() : "";
  return (
    <section className="reader collection-browser own-hub" data-reader>
      <div className="page-heading hub-heading shareable-heading">
        <div className="hub-introduction">
          <h1>{hub.hubName ?? "Your hub"}</h1>
          {/* The handle is the hub's; "by Name" only when the owner shows it. */}
          <p className="hub-identity meta">
            {hub.handle && <span className="person-handle">@{hub.handle}</span>}
            {ownerName && (
              <>
                {" by "}
                <a className="person-name" href={`/${encodeURIComponent(profile.username)}`}>
                  {ownerName}
                </a>
              </>
            )}
          </p>
          {hub.hubDescription && <p className="description">{hub.hubDescription}</p>}
        </div>
        {hub.hubId && (
          <ShareAction
            target={{ kind: "hub", id: hub.hubId }}
            returnTo={returnTo ?? `/h/${hub.hubId}`}
          />
        )}
      </div>
      <div className="hub-collections-heading">
        <h2>Your collections</h2>
      </div>
      {result.data.length ? (
        <PaginatedList
          kind="collections"
          path={`/api/v1/hubs/${profile.hubId}/collections`}
          initial={result.data}
          nextCursor={result.meta?.nextCursor}
        />
      ) : (
        <div className="empty">
          <h2>Your first collection starts with a link</h2>
          <p>Save something worth coming back to. We'll keep it private.</p>
          <a className="button primary" href="/capture">
            Save your first link
          </a>
        </div>
      )}
    </section>
  );
}
