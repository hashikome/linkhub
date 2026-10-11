"use client";
import type { Resource } from "@linkhub/types";
import { useEffect, useId, useState } from "react";
import { LocalTime } from "./local-time";

// Inline context beneath the item's disclosure; the API authorizes every field.
export function ItemDetails({
  item,
  permalink,
  preview = false,
}: {
  item: Resource;
  permalink?: string;
  preview?: boolean;
}) {
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
            {preview ? (
              <span>{item.addedBy.username}</span>
            ) : (
              <a className="person" href={`/${encodeURIComponent(item.addedBy.username)}`}>
                {item.addedBy.username}
              </a>
            )}{" "}
          </>
        )}
        <LocalTime at={item.createdAt} />
      </p>
      {permalink && <ItemPermalink permalink={permalink} />}
    </div>
  );
}

function ItemPermalink({ permalink }: { permalink: string }) {
  const inputId = useId();
  const [enhanced, setEnhanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [manualLink, setManualLink] = useState("");
  useEffect(() => setEnhanced(true), []);
  return (
    <div className="item-link-copy">
      <button
        type="button"
        className="text-button"
        disabled={!enhanced || busy}
        onClick={async () => {
          const link = new URL(permalink, window.location.origin).href;
          setBusy(true);
          setStatus("Copying…");
          setManualLink("");
          try {
            await navigator.clipboard.writeText(link);
            setStatus("Link copied.");
          } catch {
            setManualLink(link);
            setStatus("Select the link below and copy it.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Copy link to this item
      </button>
      <noscript>
        <a href={permalink}>Open item link to copy its address</a>
      </noscript>
      <span className="meta" role="status">
        {status}
      </span>
      {manualLink && (
        <div className="action-form">
          <label htmlFor={inputId}>Link to this item</label>
          <input
            id={inputId}
            value={manualLink}
            readOnly
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}
    </div>
  );
}
