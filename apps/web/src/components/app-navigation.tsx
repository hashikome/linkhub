"use client";
import type { SessionView } from "@ntumie/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { browserRead } from "../lib/browser-api";
import { isAppUrl, navigationEvent } from "../lib/navigation";
import type { Theme } from "./theme-picker";

const staleAfter = 10 * 60 * 1000;

export function AppNavigation({ theme }: { theme: Theme }) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const concealed = useRef(false);
  useEffect(() => {
    if (!pending && concealed.current) {
      delete document.documentElement.dataset.revalidating;
      concealed.current = false;
    }
  }, [pending]);
  useEffect(() => {
    let hiddenAt = 0;
    const conceal = () => {
      concealed.current = true;
      document.documentElement.dataset.revalidating = "true";
      window.dispatchEvent(new Event("reader:suspend"));
    };
    const refresh = () => {
      conceal();
      startTransition(() => router.refresh());
    };
    const go = (href: string, replace = false, afterWrite = false) => {
      const url = new URL(href, window.location.href);
      if (!isAppUrl(url, window.location.origin)) {
        window.location.assign(url.href);
        return;
      }
      const current = `${window.location.pathname}${window.location.search}`;
      const target = `${url.pathname}${url.search}`;
      startTransition(() => {
        if (current !== target || url.hash !== window.location.hash) {
          if (replace) router.replace(target + url.hash);
          else router.push(target + url.hash);
        }
        // Writes can change cookies, the account shell and the current page.
        // Refresh merges authorized server output without replacing the document.
        if (afterWrite || current === target) router.refresh();
      });
    };
    const request = (event: Event) => {
      const { href, replace, refresh } = (
        event as CustomEvent<{ href: string; replace: boolean; refresh: boolean }>
      ).detail;
      event.preventDefault();
      go(href, replace, refresh);
    };
    const click = (event: MouseEvent) => {
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
      if (
        !anchor ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download") ||
        anchor.relList.contains("external")
      )
        return;
      const url = new URL(anchor.href);
      if (!isAppUrl(url, window.location.origin)) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      )
        return;
      event.preventDefault();
      go(url.href);
    };
    const visibility = async () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = 0;
      if (away > staleAfter) {
        refresh();
        return;
      }
      const rendered = document.documentElement.dataset.session ?? "";
      const result = await browserRead<SessionView>(
        "/api/v1/session",
        new AbortController().signal,
      );
      if (result.ok ? result.data.userId !== rendered : result.status === 401 && Boolean(rendered))
        refresh();
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh();
    };
    window.addEventListener("click", click);
    window.addEventListener(navigationEvent, request);
    window.addEventListener("popstate", refresh);
    window.addEventListener("pageshow", pageshow);
    document.addEventListener("visibilitychange", visibility);
    performance.mark("app:document-ready");
    return () => {
      window.removeEventListener("click", click);
      window.removeEventListener(navigationEvent, request);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("pageshow", pageshow);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [router]);
  return pending ? (
    <>
      <div className="navigation-progress" aria-hidden="true" />
      <span className="sr-only" role="status">
        Loading…
      </span>
    </>
  ) : null;
}
