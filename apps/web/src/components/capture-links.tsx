"use client";
import {
  type CaptureLink,
  collectionAddress,
  isPublicLinkHost,
  type LinkPreview,
  maxCaptureLinks,
} from "@nslinkhub/types";
import { useEffect, useRef, useState } from "react";
import { browserRead } from "../lib/browser-api";
import { captureUrl } from "../lib/validation";
import { TagInput } from "./tag-input";

// `title` is what the page lookup found for `titleFor`; it is shown, never typed.
type Row = {
  key: number;
  url: string;
  tags: string[];
  title: string;
  titleFor: string;
  status?: LinkPreview["status"];
  left?: boolean;
  collectionHint?: boolean;
};

// A savable address on the public web (not localhost, a private or example
// name, or an IP number). Half-typed hosts like "https://exa" fail it too, so
// they are never sent for a title lookup.
function publicHref(value: string, origin: string) {
  const href = captureUrl(value);
  return href !== null &&
    (collectionAddress(href, origin) || isPublicLinkHost(new URL(href).hostname))
    ? href
    : null;
}
// Close enough to the API's canonical form to catch the same link pasted twice.
function sameKey(value: string) {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}
// The links being saved, one row each. People type only what they must: the
// address and, optionally, tags. The title is never an input; it is resolved
// from the page (shown under the address once found, and resolved again by
// the API after saving). At most two links per save; bulk import is for more.
// Without JavaScript this is a single plain row with comma-separated tags.
export function CaptureLinks({
  initial,
  origin,
  children,
}: {
  initial: CaptureLink[];
  origin: string;
  children?: React.ReactNode;
}) {
  const next = useRef(initial.length || 1);
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [{ url: "" }]).map((link, key) => ({
      key,
      url: link.url,
      tags: link.tags ?? [],
      title: "",
      titleFor: "",
      left: Boolean(link.url),
    })),
  );
  const [looking, setLooking] = useState<Set<number>>(new Set());
  const requested = useRef(new Map<number, string>());
  const focusKey = useRef<number | null>(null);
  // One in-flight lookup per row; a new address for the row cancels the old one.
  const lookups = useRef(new Map<number, AbortController>());
  useEffect(() => {
    const pending = lookups.current;
    return () => {
      for (const controller of pending.values()) controller.abort();
    };
  }, []);

  const update = (key: number, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));

  // A link may appear once per save: a repeat is flagged and blocks saving.
  const duplicates = new Set(
    rows
      .filter(
        (row, index) =>
          row.url.trim() &&
          rows.slice(0, index).some((earlier) => sameKey(earlier.url) === sameKey(row.url)),
      )
      .map((row) => row.key),
  );
  // What the link field says about each address: blue once its title is
  // found, red (and blocking) for a repeat, a non-address or a domain that does
  // not exist. A site that exists but gave no title is still saved.
  const check = (row: Row) => {
    const url = row.url.trim();
    if (!url) return null;
    if (duplicates.has(row.key))
      return {
        state: "invalid",
        message: "This link is already in the list. Use a different link or remove this one.",
      };
    if (captureUrl(url) && !publicHref(url, origin))
      return row.left
        ? {
            state: "invalid",
            message:
              "This address only works on your own computer or network, or is an example. Use a public web address.",
          }
        : null;
    if (!captureUrl(url))
      return row.left
        ? {
            state: "invalid",
            message: "Enter the full address, starting with https:// or http://.",
          }
        : null;
    if (row.titleFor !== url) return null;
    if (row.status === "no_domain")
      return { state: "invalid", message: "This address doesn't exist. Check it for typos." };
    if (row.status === "found") return { state: "valid", message: "" };
    return {
      state: "",
      message: "We couldn't read a title right now. The link will still be saved.",
    };
  };
  const checks = new Map(rows.map((row) => [row.key, check(row)]));
  // biome-ignore lint/correctness/useExhaustiveDependencies: `checks` is derived from `rows`.
  useEffect(() => {
    for (const row of rows) {
      const input = document.getElementById(`capture-url-${row.key}`) as HTMLInputElement | null;
      const result = checks.get(row.key);
      input?.setCustomValidity(result?.state === "invalid" ? result.message : "");
    }
  }, [rows]);

  // Look up the title of each usable address once.
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const row of rows) {
        const url = row.url.trim();
        if (!publicHref(url, origin) || requested.current.get(row.key) === url) continue;
        requested.current.set(row.key, url);
        lookups.current.get(row.key)?.abort();
        const controller = new AbortController();
        lookups.current.set(row.key, controller);
        const signal = controller.signal;
        setLooking((current) => new Set(current).add(row.key));
        browserRead<LinkPreview>(`/api/v1/link-preview?${new URLSearchParams({ url })}`, signal)
          .catch(() => null)
          .then((result) => {
            if (signal.aborted) return;
            const { title, status, collectionHint } = result?.ok
              ? result.data
              : { title: null, status: "untitled" as const, collectionHint: false };
            setRows((current) =>
              current.map((r) =>
                r.key === row.key && r.url.trim() === url
                  ? { ...r, title: title ?? "", titleFor: url, status, collectionHint }
                  : r,
              ),
            );
          })
          .finally(() => {
            if (lookups.current.get(row.key) !== controller) return;
            lookups.current.delete(row.key);
            setLooking((current) => {
              const copy = new Set(current);
              copy.delete(row.key);
              return copy;
            });
          });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [rows, origin]);

  useEffect(() => {
    if (focusKey.current === null) return;
    document.getElementById(`capture-url-${focusKey.current}`)?.focus();
    focusKey.current = null;
  });

  function add() {
    const key = next.current++;
    focusKey.current = key;
    setRows((current) => [...current, { key, url: "", tags: [], title: "", titleFor: "" }]);
  }

  const several = rows.length > 1;
  const filled = rows.filter((row) => row.url.trim()).length;
  return (
    <div className="capture-links">
      <ol className="capture-rows">
        {rows.map((row, index) => (
          <li key={row.key}>
            <fieldset className="capture-row">
              <legend className="sr-only">Link {index + 1}</legend>
              <label htmlFor={`capture-url-${row.key}`}>Link URL</label>
              <div className="capture-url">
                <input
                  id={`capture-url-${row.key}`}
                  name="url"
                  type="url"
                  required={index === 0}
                  maxLength={2048}
                  value={row.url}
                  onChange={(event) => update(row.key, { url: event.target.value })}
                  onBlur={() => update(row.key, { left: true })}
                  placeholder="https://example.com"
                  autoComplete="url"
                  data-state={checks.get(row.key)?.state || undefined}
                  aria-invalid={checks.get(row.key)?.state === "invalid" || undefined}
                  aria-describedby={
                    checks.get(row.key)?.message ? `capture-note-${row.key}` : undefined
                  }
                />
                {several && (
                  <button
                    type="button"
                    className="capture-remove"
                    aria-label={`Remove link ${index + 1}`}
                    title="Remove this link"
                    onClick={() => {
                      focusKey.current = (rows[index + 1] ?? rows[index - 1])?.key ?? null;
                      setRows((current) => current.filter((r) => r.key !== row.key));
                    }}
                  >
                    <RemoveIcon />
                  </button>
                )}
              </div>
              {checks.get(row.key)?.message ? (
                <p
                  className={`capture-note${checks.get(row.key)?.state === "invalid" ? " invalid" : ""}`}
                  id={`capture-note-${row.key}`}
                >
                  {checks.get(row.key)?.message}
                </p>
              ) : row.url.trim() && row.titleFor === row.url.trim() && row.title ? (
                <p className="capture-title">{row.title}</p>
              ) : looking.has(row.key) ? (
                <p className="capture-title pending">Finding the title…</p>
              ) : null}
              {row.titleFor === row.url.trim() && row.collectionHint && (
                <p className="capture-title">Collection</p>
              )}
              <TagInput id={`capture-tags-${row.key}`} initial={row.tags.join(", ")} />
            </fieldset>
          </li>
        ))}
      </ol>
      <p className="meta capture-help">
        Paste the full address, starting with https:// or http://. The title is found for you.
      </p>
      {/* Two links keep saving to a couple of copy-and-paste trips; more is
          what bulk import is for, so it takes the place of "Add another link".
          Rendered from the first paint; hidden only when JavaScript is off. */}
      {rows.length < maxCaptureLinks ? (
        <button type="button" className="button capture-add" onClick={add}>
          <span aria-hidden="true">+</span> Add another link
        </button>
      ) : (
        <BulkImport />
      )}
      {children}
      <button className="button primary capture-submit" type="submit">
        {filled > 1 ? `Save ${filled} links` : "Save link"}
      </button>
    </div>
  );
}

const RemoveIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

function BulkImport() {
  return (
    <div className="capture-bulk">
      <a className="button capture-add" href="/manage/import-export">
        Bulk import links
      </a>
    </div>
  );
}
