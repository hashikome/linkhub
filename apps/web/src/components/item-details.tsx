import type { Resource } from "@nslinkhub/types";
import { LocalTime } from "./local-time";

// Inline context beneath the item's disclosure; the API authorizes every field.
export function ItemDetails({ item, permalink }: { item: Resource; permalink: string }) {
  return (
    <div className="item-context">
      {item.siteName && <p className="meta">{item.siteName}</p>}
      {item.description && <p className="description">{item.description}</p>}
      {item.kind === "collection_link" && !item.linkedCollection && (
        <p>This collection may be private or no longer available.</p>
      )}
      <p className="meta">
        Added{" "}
        {item.addedBy && (
          <>
            by{" "}
            <a className="person" href={`/${encodeURIComponent(item.addedBy.username)}`}>
              {item.addedBy.username}
            </a>{" "}
          </>
        )}
        <LocalTime at={item.createdAt} />
      </p>
      <a href={permalink}>Link to this item</a>
    </div>
  );
}
