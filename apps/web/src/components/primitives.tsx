import type { Collection, PersonRef, Resource } from "@nslinkhub/types";
import { hubPath, permalink, prettyPath } from "../lib/http";
import { ItemDetails } from "./item-details";
import { ItemDisclosure } from "./item-disclosure";
import { Updated } from "./local-time";

export function Tags({ tags, limit = tags.length }: { tags: string[]; limit?: number }) {
  const remaining = Math.max(0, tags.length - limit);
  return tags.length ? (
    <ul className="tags" aria-label="Tags">
      {tags.slice(0, limit).map((tag) => (
        <li key={tag}>{tag}</li>
      ))}
      {remaining > 0 && (
        <li className="resource-tag-count" title={tags.slice(limit).join(", ")}>
          +{remaining} {remaining === 1 ? "tag" : "tags"}
        </li>
      )}
    </ul>
  ) : null;
}
export function CollectionRow({ item, handle }: { item: Collection; handle?: string }) {
  return (
    <li className="collection-row">
      <h2>
        <a href={handle ? prettyPath(handle, item.slug) : permalink(item.id)}>{item.title}</a>
      </h2>
      {item.description && <p className="preview">{item.description}</p>}
      <CollectionMeta item={item} handle={handle} compact />
    </li>
  );
}
// People link to their own profile; hubs keep their separate @handle identity.
export function Person({ person }: { person: PersonRef }) {
  return (
    <a className="person" href={`/${encodeURIComponent(person.username)}`}>
      <span className="person-handle">{person.username}</span>
    </a>
  );
}
export function CollectionMeta({
  item,
  handle,
  compact = false,
}: {
  item: Collection;
  handle?: string;
  compact?: boolean;
}) {
  const owner = item.hub;
  const creator =
    // Only when the owner is known and the creator is someone else.
    !compact && item.hub?.owner && item.creator && item.creator.userId !== item.hub.owner.userId
      ? item.creator
      : null;
  return (
    <div className="row-meta">
      {owner ? (
        <a className="person" href={`/h/${encodeURIComponent(owner.id)}`}>
          <span className="person-handle">@{owner.handle}</span>
        </a>
      ) : (
        handle && (
          <a className="person" href={hubPath(handle)}>
            <span className="person-handle">@{handle}</span>
          </a>
        )
      )}
      {creator && (
        <span>
          Created by <Person person={creator} />
        </span>
      )}

      <span>
        Updated <Updated at={item.updatedAt} />
      </span>
      {compact && !item.published && <span className="row-badge">Private</span>}
      {compact && item.tags.length > 0 && (
        <span className="row-tags">
          {item.tags
            .slice(0, 3)
            .map((tag) => `#${tag}`)
            .join(" ")}
        </span>
      )}
    </div>
  );
}
export function ResourceRow({
  item,
  itemBase,
  expanded = false,
  onExpandedChange,
}: {
  item: Resource;
  itemBase?: string;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}) {
  const detailsUrl = new URL(itemBase ?? permalink(item.collectionId), "http://local.invalid");
  detailsUrl.searchParams.set("item", item.id);
  detailsUrl.hash = `item-${item.id}`;
  if (item.kind === "heading")
    return (
      <li className="resource-heading">
        <h2>{item.title}</h2>
        {item.description && <p className="section-description">{item.description}</p>}
      </li>
    );
  let url: URL | undefined;
  try {
    const value = new URL(item.url ?? "");
    if (["http:", "https:"].includes(value.protocol)) url = value;
  } catch {}
  const reference = item.kind === "collection_link";
  const destination = reference
    ? item.linkedCollection && permalink(item.linkedCollection.id)
    : url?.href;
  const title = reference
    ? item.linkedCollection?.title || "Collection unavailable"
    : item.title || url?.href || "Link unavailable";
  return (
    <li
      className={`resource-row${reference && !destination ? " resource-unavailable" : ""}`}
      id={`item-${item.id}`}
    >
      <ItemDisclosure
        expanded={expanded}
        itemId={item.id}
        collectionId={item.collectionId}
        onExpandedChange={onExpandedChange}
      >
        <summary aria-label={`Details: ${title}`}>
          <h2>
            {destination ? (
              <a href={destination} rel="noreferrer" referrerPolicy="no-referrer">
                {title}
              </a>
            ) : (
              title
            )}
          </h2>
          <div className="meta resource-meta">
            {reference ? (
              destination ? (
                <>
                  <CollectionIcon />
                  <span className="resource-kind">Collection</span>
                </>
              ) : (
                <span>This collection may be private or no longer available.</span>
              )
            ) : (
              url && (
                <>
                  <span>{url.hostname.replace(/^www\./, "")}</span>
                  <ExternalIcon />
                </>
              )
            )}
            <Tags tags={item.tags} />
          </div>
        </summary>
        <ItemDetails
          item={item}
          permalink={detailsUrl.pathname + detailsUrl.search + detailsUrl.hash}
        />
      </ItemDisclosure>
    </li>
  );
}
// One stroke-icon family (1.5px, round joins) shared with the header controls.
function ExternalIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}
function CollectionIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="resource-kind"
    >
      <rect x="3" y="7" width="14" height="14" rx="2.5" />
      <path d="M7 3h11.5A2.5 2.5 0 0 1 21 5.5V17" />
    </svg>
  );
}
