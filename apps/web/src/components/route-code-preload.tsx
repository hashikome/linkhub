"use client";
import { useEffect } from "react";
import { fetchBuildAsset } from "../lib/http";
import { isAppUrl } from "../lib/navigation";
import { chunksFor, compileRouteChunks } from "../lib/route-chunks";

const hoverIntentMs = 80;

// Loads only the next route's immutable JavaScript on link intent, never its data
// (ADR-0064: no speculative private prefetch). Navigation then skips the chunk
// request that would otherwise wait for the page response.
export function RouteCodePreload({ manifest }: { manifest: string | null }) {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (!manifest || connection?.saveData) return;
    let routes: ReturnType<typeof compileRouteChunks> = [];
    let loading: Promise<void> | undefined;
    const requested = new Set<string>();
    const load = () => {
      loading ??= fetchBuildAsset(manifest, true)
        .then((data) => {
          routes = compileRouteChunks(data);
        })
        .catch(() => {});
      return loading;
    };
    const preload = async (anchor: HTMLAnchorElement) => {
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (!isAppUrl(url, window.location.origin)) return;
      await load();
      const loaded = new Set(
        Array.from(document.scripts, (script) => (script.src ? new URL(script.src).pathname : "")),
      );
      for (const chunk of chunksFor(url.pathname, routes)) {
        if (requested.has(chunk) || loaded.has(chunk)) continue;
        requested.add(chunk);
        fetchBuildAsset(chunk).catch(() => requested.delete(chunk));
      }
    };
    const anchorOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
    let hovered: HTMLAnchorElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const over = (event: PointerEvent) => {
      const anchor = anchorOf(event.target);
      if (anchor === hovered) return;
      clearTimeout(timer);
      hovered = anchor;
      if (anchor && event.pointerType === "mouse")
        timer = setTimeout(() => void preload(anchor), hoverIntentMs);
    };
    const now = (event: Event) => {
      const anchor = anchorOf(event.target);
      if (anchor) void preload(anchor);
    };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(() => void load(), { timeout: 4000 })
      : window.setTimeout(() => void load(), 2000);
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", now);
    document.addEventListener("touchstart", now, { passive: true });
    document.addEventListener("focusin", now);
    return () => {
      clearTimeout(timer);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", now);
      document.removeEventListener("touchstart", now);
      document.removeEventListener("focusin", now);
    };
  }, [manifest]);
  return null;
}
