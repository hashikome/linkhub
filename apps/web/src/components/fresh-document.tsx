"use client";
import type { SessionView } from "@nslinkhub/types";
import { useEffect, useState } from "react";
import { browserRead } from "../lib/browser-api";

// Document navigation avoids the router cache. Never restore an old authorized
// DOM from bfcache or a background tab before a fresh server authorization.
// Fast navigations keep the current page until the next one paints; only a
// navigation still pending after this delay hides it behind the progress state.
const slowNavigation = 300;
// Returning to a tab re-checks the session cheaply; after a long absence the
// whole page reloads so revoked shares or unpublished content are re-authorized.
const staleAfter = 10 * 60 * 1000;

export function FreshDocument() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let recovery: ReturnType<typeof setTimeout> | undefined;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let hiddenAt = 0;
    const hide = () => {
      clearTimeout(pending);
      pending = undefined;
      clearTimeout(recovery);
      setSlow(false);
      recovery = setTimeout(() => setSlow(true), 8000);
      document.documentElement.dataset.revalidating = "true";
      window.dispatchEvent(new Event("reader:suspend"));
    };
    const soon = () => {
      clearTimeout(pending);
      pending = setTimeout(hide, slowNavigation);
    };
    const reload = () => {
      hide();
      window.location.reload();
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (
        url.origin === window.location.origin &&
        (url.pathname !== window.location.pathname || url.search !== window.location.search)
      )
        soon();
    };
    const submit = (event: SubmitEvent) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
      if (new URL(event.target.action).origin === window.location.origin) soon();
    };
    window.addEventListener("submit", submit);
    window.addEventListener("click", navigate);
    const visibility = async () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = 0;
      if (away > staleAfter) return reload();
      const rendered = document.documentElement.dataset.session ?? "";
      if (!rendered) return;
      const result = await browserRead<SessionView>(
        "/api/v1/session",
        new AbortController().signal,
      );
      // Only a definite answer counts; a network failure is not a sign-out.
      if (result.ok ? result.data.userId !== rendered : result.status === 401) reload();
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) reload();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", pageshow);
    // Escape (or a cancelled load) shows the progress state and its recovery at once.
    const cancelled = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pending) hide();
      if (document.documentElement.dataset.revalidating === "true") setSlow(true);
    };
    window.addEventListener("keydown", cancelled);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(recovery);
      clearTimeout(pending);
      window.removeEventListener("keydown", cancelled);
      window.removeEventListener("submit", submit);
      window.removeEventListener("click", navigate);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", pageshow);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return (
    <div className="navigation-loading">
      <p className="navigation-progress" role="status">
        <span className="loading-indicator" aria-hidden="true" />
        Loading page…
      </p>
      {slow && (
        <div className="navigation-recovery">
          <p>This is taking longer than expected.</p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Reload this page
          </button>
        </div>
      )}
    </div>
  );
}
