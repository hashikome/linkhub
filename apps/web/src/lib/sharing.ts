import type { ShareTarget as ApiShareTarget } from "@ntumie/types";
import { safeDocumentReturn } from "./http";

export type ShareTarget = ApiShareTarget & { token?: string };

export function sourcePath(path: string, query: Record<string, string | string[] | undefined>) {
  const url = new URL(path, "http://local.invalid");
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") url.searchParams.set(key, value);
  }
  return safeDocumentReturn(url.pathname + url.search);
}

export function sharePath(target: ShareTarget, returnTo: string): string {
  const query = new URLSearchParams({ kind: target.kind, returnTo: safeDocumentReturn(returnTo) });
  if (target.kind !== "site") query.set("id", target.id);
  if (target.kind === "collection" && target.token) query.set("s", target.token);
  return `/share?${query}`;
}

export function shareReturn(value: unknown, fallback: string) {
  const href = typeof value === "string" ? safeDocumentReturn(value) : fallback;
  const path = new URL(href, "http://local.invalid").pathname;
  const label =
    path === "/about"
      ? "Back to About ntumie."
      : path === "/"
        ? "Back to home"
        : path === "/manage/collections"
          ? "Back to collections"
          : path.startsWith("/c/")
            ? "Back to collection"
            : path === "/hub" || path.startsWith("/h/") || /^\/@[^/]+$/.test(path)
              ? "Back to hub"
              : path.startsWith("/people/") ||
                  (/^\/[a-z0-9-]+$/.test(path) &&
                    ![
                      "/discover",
                      "/settings",
                      "/manage",
                      "/support",
                      "/share",
                      "/notifications",
                      "/capture",
                      "/confirm",
                      "/sign-in",
                    ].includes(path))
                ? "Back to profile"
                : path === "/discover"
                  ? "Back to Discover"
                  : "Back";
  return { href, label };
}
