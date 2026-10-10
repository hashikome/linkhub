"use client";
import type { Collection, HubPage, Resource } from "@nslinkhub/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { browserRead } from "../lib/browser-api";
import { type ApiPath, type Failure, withCursor } from "../lib/http";
import { Retry } from "./feedback";
import { CollectionRow } from "./primitives";
import { ResourceSections } from "./resource-sections";

type Props = {
  path: ApiPath;
  nextCursor?: string | null;
  token?: string;
  itemBase?: string;
  section?: Resource;
  selectedItem?: Resource;
  collectionId?: string;
  canEdit?: boolean;
  publicHub?: { handle: string; preview?: boolean };
} & ({ kind: "collections"; initial: Collection[] } | { kind: "resources"; initial: Resource[] });
export function PaginatedList(props: Props) {
  const [items, setItems] = useState<(Collection | Resource)[]>(props.initial);
  const [cursor, setCursor] = useState(props.nextCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Failure>();
  const [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const [desktop, setDesktop] = useState(false);
  const [pageStart, setPageStart] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refit when the rendered page or its content changes.
  useLayoutEffect(() => {
    if (props.kind !== "collections" || !list.current) return;
    const element = list.current;
    const media = matchMedia("(min-width: 640px) and (min-height: 481px)");
    const fit = () => {
      const rows = Array.from(element.children) as HTMLElement[];
      for (const row of rows) row.hidden = false;
      if (!media.matches) {
        setDesktop(false);
        setPageStart(0);
        setHistory([]);
        return;
      }
      const main = document.querySelector("main");
      window.scrollTo(0, 0);
      const controls = continuation.current;
      const bottom = main
        ? main.getBoundingClientRect().bottom -
          Number.parseFloat(getComputedStyle(main).paddingBottom) -
          (controls?.getBoundingClientRect().height ?? 44) -
          16
        : element.getBoundingClientRect().bottom;
      let count = 0;
      for (const row of rows) {
        if (row.getBoundingClientRect().bottom > bottom + 1) break;
        count++;
      }
      // Zoom/very long content must remain reachable even when one row cannot fit.
      const fits = count > 0;
      element.closest(".collection-browser")?.classList.toggle("fits-desktop", fits);
      if (fits) for (let i = count; i < rows.length; i++) rows[i].hidden = true;
      setDesktop(fits);
      setPageCount(count);
    };
    element.closest(".collection-browser")?.classList.add("sized-collections");
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    media.addEventListener("change", fit);
    fit();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", fit);
    };
  }, [props.kind, items, pageStart]);
  // Links without a title are looked up when the collection opens; read the
  // first page once more shortly after and fill in the titles that arrived.
  // biome-ignore lint/correctness/useExhaustiveDependencies: One follow-up read per opened list.
  useEffect(() => {
    if (props.kind !== "resources") return;
    const untitled = (props.initial as Resource[]).some(
      (r) => r.kind === "external_link" && !r.title,
    );
    if (!untitled) return;
    // The worker looks titles up within seconds of a save (a slow site takes up
    // to its 3 s deadline); read again twice to pick them up.
    const controller = new AbortController();
    const refresh = async () => {
      const result = await browserRead<Resource[]>(
        props.path,
        controller.signal,
        props.token,
      ).catch(() => null);
      if (!result?.ok) return;
      const fresh = new Map(result.data.map((r) => [r.id, r]));
      setItems((current) =>
        current.map((item) => {
          const found = fresh.get(item.id);
          return found?.title && !(item as Resource).title
            ? {
                ...item,
                title: found.title,
                description: found.description,
                siteName: found.siteName,
              }
            : item;
        }),
      );
    };
    const timers = [2500, 6000].map((delay) => setTimeout(refresh, delay));
    return () => {
      for (const timer of timers) clearTimeout(timer);
      controller.abort();
    };
  }, []);
  const active = useRef<AbortController | null>(null);
  const continuation = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!restoreFocus.current) return;
    (
      continuation.current?.querySelector<HTMLElement>("[data-next-page]") ??
      continuation.current?.querySelector<HTMLElement>("a,button")
    )?.focus({ preventScroll: true });
    if (!pending) restoreFocus.current = false;
  }, [pending]);
  useEffect(() => {
    const stop = () => active.current?.abort();
    window.addEventListener("reader:suspend", stop);
    return () => {
      stop();
      window.removeEventListener("reader:suspend", stop);
    };
  }, []);
  async function more(nextPage = false) {
    if (!cursor || active.current) return;
    restoreFocus.current = continuation.current?.contains(document.activeElement) ?? false;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(undefined);
    const result = await browserRead<(Collection | Resource)[] | HubPage>(
      withCursor(props.path, cursor),
      controller.signal,
      props.token,
    );
    if (controller.signal.aborted) return;
    active.current = null;
    setPending(false);
    if (!result.ok) {
      if ([401, 403, 404].includes(result.status)) {
        document.documentElement.dataset.revalidating = "true";
        window.location.reload();
        return;
      }
      setError(result);
      return;
    }
    const data = props.publicHub
      ? (result.data as HubPage).collections
      : (result.data as (Collection | Resource)[]);
    const seen = new Set(items.map((item) => item.id));
    const additions = data.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    setItems((current) => [...current, ...additions]);
    setCursor(result.meta?.nextCursor);
    setAnnouncement(`${additions.length} more ${props.kind} loaded.`);
    if (nextPage && additions.length) {
      setHistory((current) => [...current, pageStart]);
      setPageStart(items.length);
    }
  }
  const viewParams = {
    ...(props.token ? { s: props.token } : {}),
    ...(props.publicHub?.preview ? { view: "public" } : {}),
  };
  const fallback = `?${new URLSearchParams({ cursor: cursor ?? "", ...viewParams })}`;
  const hasPages = history.length > 0 || pageStart + pageCount < items.length || Boolean(cursor);
  return (
    <>
      {props.kind === "resources" ? (
        <ResourceSections
          items={items as Resource[]}
          section={props.section}
          itemBase={props.itemBase}
          collectionId={props.collectionId}
          canEdit={props.canEdit}
          selectedItem={props.selectedItem}
        />
      ) : (
        <ul ref={list} className="collection-list">
          {items.slice(desktop ? pageStart : 0).map((item) => (
            <CollectionRow
              key={item.id}
              item={item as Collection}
              handle={props.publicHub?.handle}
            />
          ))}
        </ul>
      )}
      {!items.length && (
        <p className="empty">
          {props.kind === "collections"
            ? props.publicHub
              ? "No published collections here yet."
              : "No published collections yet."
            : "No resources in this collection yet."}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="continuation" aria-busy={pending} ref={continuation}>
        {error && (
          <p role="status">
            {error.code === "invalid_cursor"
              ? "This list has changed. Reload to see the latest results."
              : "Couldn't load more. Your current results are still here."}
          </p>
        )}
        {error?.code === "invalid_cursor" ? (
          <a className="button" href={`?${new URLSearchParams(viewParams)}`}>
            Reload list
          </a>
        ) : error ? (
          <Retry seconds={error.retryAfter} action={() => more(desktop)} />
        ) : desktop ? (
          hasPages ? (
            <div className="collection-pagination">
              <button
                className="button"
                type="button"
                disabled={!history.length || pending}
                onClick={() => {
                  setPageStart(history.at(-1) ?? 0);
                  setHistory((current) => current.slice(0, -1));
                }}
              >
                Previous
              </button>
              <span className="sr-only" role="status">
                {items.length
                  ? `${pageStart + 1}–${Math.min(pageStart + pageCount, items.length)}`
                  : "0"}
              </span>
              <button
                className="button"
                type="button"
                data-next-page
                disabled={pending || (pageStart + pageCount >= items.length && !cursor)}
                onClick={() => {
                  if (pageStart + pageCount < items.length) {
                    setHistory((current) => [...current, pageStart]);
                    setPageStart(pageStart + pageCount);
                  } else void more(true);
                }}
              >
                {pending ? "Loading…" : "Next"}
              </button>
            </div>
          ) : null
        ) : cursor || announcement ? (
          <a
            className="button"
            href={fallback}
            aria-disabled={pending || !cursor}
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
            {pending ? "Loading…" : cursor ? `More ${props.kind}` : `All ${props.kind} loaded`}
          </a>
        ) : null}
      </div>
    </>
  );
}
