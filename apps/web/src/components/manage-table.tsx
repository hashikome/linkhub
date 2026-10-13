"use client";

import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { type Failure, failure, type Result } from "../lib/http";
import { refreshInApp } from "../lib/navigation";
import { Retry } from "./feedback";
import { OperatorTableRegion } from "./operator-table-region";

export type ManageRow = {
  id: string;
  content: ReactNode;
};

export function ManageTable({
  label,
  headers,
  initial,
  nextCursor,
  href,
  empty,
  loadMore,
}: {
  label: string;
  headers: ReactNode;
  initial: ManageRow[];
  nextCursor?: string | null;
  href: string;
  empty: ReactNode;
  loadMore: (cursor: string) => Promise<Result<ManageRow[]>>;
}) {
  const [rows, setRows] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure>();
  const [announcement, setAnnouncement] = useState("");
  const busy = useRef(false);
  const suspended = useRef(false);
  const generation = useRef(0);
  const table = useRef<HTMLTableElement>(null);
  useEffect(() => {
    suspended.current = false;
    busy.current = false;
    setRows(initial);
    setCursor(nextCursor);
    setPending(false);
    setError(undefined);
    const stop = () => {
      suspended.current = true;
      generation.current++;
    };
    window.addEventListener("reader:suspend", stop);
    return () => {
      stop();
      window.removeEventListener("reader:suspend", stop);
    };
  }, [initial, nextCursor]);
  useEffect(() => {
    if (announcement && !cursor) table.current?.focus({ preventScroll: true });
  }, [announcement, cursor]);
  async function more() {
    if (!cursor || busy.current || suspended.current) return;
    const attempt = generation.current;
    busy.current = true;
    setPending(true);
    setError(undefined);
    let result: Result<ManageRow[]>;
    try {
      result = await loadMore(cursor);
    } catch {
      result = failure();
    }
    if (suspended.current || attempt !== generation.current) return;
    busy.current = false;
    setPending(false);
    if (!result.ok) {
      if ([401, 403].includes(result.status)) {
        refreshInApp();
        return;
      }
      setError(result);
      return;
    }
    const seen = new Set(rows.map((row) => row.id));
    const additions = result.data.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    setRows((current) => [...current, ...additions]);
    setCursor(result.meta?.nextCursor);
    setAnnouncement(
      `${additions.length} more rows loaded.${result.meta?.nextCursor ? "" : " All rows loaded."}`,
    );
  }
  const [path, query] = href.split("?");
  const params = new URLSearchParams(query);
  if (cursor) params.set("cursor", cursor);
  return (
    <OperatorTableRegion label={label}>
      {rows.length ? (
        <table className="ops-table" ref={table} tabIndex={-1} aria-busy={pending}>
          <caption className="sr-only">{label}</caption>
          <thead>{headers}</thead>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Row clicks supplement the native name button for keyboard navigation. */}
          <tbody
            onClick={(event) => {
              const target = event.target;
              if (
                !(target instanceof Element) ||
                target.closest(
                  "a, button, input, select, textarea, summary, label, dialog, .audit-id-copy",
                ) ||
                window.getSelection()?.toString() ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              target
                .closest("tr")
                ?.querySelector<HTMLButtonElement>("button.account-open, button.collection-open")
                ?.click();
            }}
          >
            {rows.map((row) => (
              <Fragment key={row.id}>{row.content}</Fragment>
            ))}
          </tbody>
        </table>
      ) : (
        empty
      )}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {(cursor || error) && (
        <div className="continuation">
          {error && (
            <p role="status">
              {error.code === "invalid_cursor"
                ? "These results have changed. Reload to see the latest results."
                : "Couldn't load more. Your current results are still here."}
            </p>
          )}
          {error?.code === "invalid_cursor" ? (
            <a className="button" href={href}>
              Reload list
            </a>
          ) : error ? (
            <Retry seconds={error.retryAfter} action={() => void more()} />
          ) : (
            <a
              className="button"
              href={`${path}?${params}`}
              aria-disabled={pending}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                void more();
              }}
            >
              {pending ? "Loading…" : "Load more"}
            </a>
          )}
        </div>
      )}
    </OperatorTableRegion>
  );
}
