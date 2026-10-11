"use client";
import type { SessionView } from "@linkhub/types";
import { useEffect, useState } from "react";
import { browserRead } from "../lib/browser-api";

// Document navigation avoids the router cache. Never restore an old authorized
// DOM from bfcache or a background tab before a fresh server authorization.
// Ordinary navigation uses browser-native progress and keeps the current view.
// Mutation submissions conceal potentially stale content after a short delay.
const mutationConcealDelay = 300;
// Returning to a tab re-checks the session cheaply; after a long absence the
// whole page reloads so revoked shares or unpublished content are re-authorized.
const staleAfter = 10 * 60 * 1000;

export function FreshDocument() {
  const [interrupted, setInterrupted] = useState(false);
  useEffect(() => {
    let navigating = false;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let hiddenAt = 0;
    const hide = () => {
      clearTimeout(pending);
      pending = undefined;
      setInterrupted(false);
      document.documentElement.dataset.revalidating = "true";
      window.dispatchEvent(new Event("reader:suspend"));
    };
    const beginNavigation = (conceal = false) => {
      navigating = true;
      clearTimeout(pending);
      if (conceal) pending = setTimeout(hide, mutationConcealDelay);
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
        beginNavigation();
    };
    const submit = (event: SubmitEvent) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
      if (new URL(event.target.action).origin === window.location.origin)
        beginNavigation(event.target.method.toLowerCase() !== "get");
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
    // A cancelled navigation offers recovery, without routine loading feedback.
    const cancelled = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!navigating && document.documentElement.dataset.revalidating !== "true") return;
      navigating = false;
      hide();
      setInterrupted(true);
    };
    window.addEventListener("keydown", cancelled);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(pending);
      window.removeEventListener("keydown", cancelled);
      window.removeEventListener("submit", submit);
      window.removeEventListener("click", navigate);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", pageshow);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  if (!interrupted) return null;
  return (
    <div className="navigation-recovery" role="alert">
      <p>Navigation was interrupted.</p>
      <button type="button" className="button" onClick={() => window.location.reload()}>
        Reload this page
      </button>
    </div>
  );
}
