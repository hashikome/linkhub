import { browserApiOrigin } from "@nslinkhub/config/web-browser";
import type { ApiWarning, CursorMeta } from "@nslinkhub/types";
import { isApiErrorCode, SHARE_ATTRIBUTION_KEYS } from "@nslinkhub/types";

import { isUuid } from "./validation";

export type ApiPath = `/api/v1/${string}`;
export type Failure = { ok: false; code: string; status: number; retryAfter: number };
export type Result<T> =
  | { ok: true; data: T; meta?: CursorMeta; warnings?: ApiWarning[]; status?: number }
  | Failure;

export function failure(code = "unavailable", status = 0, retryAfter = 0): Failure {
  return { ok: false, code, status, retryAfter };
}

// WebAuthn needs browser credential APIs. Only its four app-owned JSON paths
// cross this adapter; ordinary product writes keep their native-form boundary.
export type PasskeyPath =
  | "/security/passkey/options"
  | "/security/passkey/verify"
  | "/passkey/generate-authenticate-options"
  | "/passkey/verify-authentication";
export async function submitPasskey<T>(path: PasskeyPath, body: unknown = {}): Promise<Result<T>> {
  const signal = AbortSignal.timeout(10000);
  try {
    const response = await fetch(`${browserApiOrigin()}/api/v1/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal,
    });
    const data = await response.json();
    return response.ok
      ? { ok: true, data: data as T }
      : failure(
          isApiErrorCode(data?.error?.code) ? data.error.code : "unavailable",
          response.status,
        );
  } catch {
    return failure(signal.aborted ? "request_timeout" : "unavailable");
  }
}

// Progressive enhancement for native forms: same origin, bounded wait and no
// automatic redirect that could turn a sign-in document into a successful save.
export async function submitForm<T>(
  path: `/forms/${string}`,
  body: URLSearchParams,
  fetcher: typeof fetch = fetch,
): Promise<Result<T>> {
  if (!/^\/forms\/[a-z-]+$/.test(path)) throw new Error("Invalid form path");
  const signal = AbortSignal.timeout(10000);
  try {
    const response = await fetcher(path, {
      method: "POST",
      headers: { Accept: "application/json" },
      body,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      redirect: "error",
    });
    const payload = await response.json();
    if (response.ok && payload?.ok === true && "data" in payload)
      return {
        ok: true,
        data: payload.data as T,
        ...(payload.warnings ? { warnings: payload.warnings } : {}),
      };
    return failure(isApiErrorCode(payload?.code) ? payload.code : "unavailable", response.status);
  } catch {
    return failure(signal.aborted ? "request_timeout" : "unavailable");
  }
}

export function safePath(path: ApiPath): string {
  const parsed = new URL(path, "http://internal.invalid");
  if (
    parsed.origin !== "http://internal.invalid" ||
    !parsed.pathname.startsWith("/api/v1/") ||
    /[\\\r\n#]/.test(path) ||
    /%2f|%5c/i.test(parsed.pathname)
  )
    throw new Error("Invalid API path");
  return parsed.pathname + parsed.search;
}

export async function readJson<T>(
  url: string,
  options: {
    headers?: HeadersInit;
    credentials?: RequestCredentials;
    timeout: number;
    signal?: AbortSignal;
    fetcher?: typeof fetch;
  },
): Promise<Result<T>> {
  const timeout = AbortSignal.timeout(options.timeout);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      headers: options.headers,
      signal,
      redirect: "error",
      cache: "no-store",
      credentials: options.credentials ?? "same-origin",
    });
    const payload = await response.json();
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const seconds =
        retry && /^\d+$/.test(retry)
          ? Number(retry)
          : Math.ceil((Date.parse(retry ?? "") - Date.now()) / 1000);
      return failure(
        isApiErrorCode(payload?.error?.code) ? payload.error.code : "unavailable",
        response.status,
        Number.isFinite(seconds) ? Math.max(0, seconds) : 0,
      );
    }
    if (!payload || typeof payload !== "object" || !("data" in payload)) return failure();
    return { ok: true, data: payload.data as T, meta: payload.meta };
  } catch {
    return failure(signal.aborted ? "request_timeout" : "unavailable");
  }
}

export function withCursor(path: ApiPath, cursor?: string | null): ApiPath {
  const url = new URL(path, "http://internal.invalid");
  url.searchParams.set("limit", "20");
  if (cursor) url.searchParams.set("cursor", cursor);
  return safePath((url.pathname + url.search) as ApiPath) as ApiPath;
}
// Only @-prefixed route segments belong to public hubs. The API remains the
// identity and authorization authority after this URL-shape validation.
// Next's dynamic segment payload percent-encodes @. Decode exactly once;
// route validation below still rejects separators and double-encoded input.
export function routeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
export function routeHandle(segment: string): string | undefined {
  return /^@[a-z0-9-]{3,60}$/.test(segment) ? segment.slice(1) : undefined;
}
export function hubPath(handle: string): string {
  return `/@${encodeURIComponent(handle)}`;
}
export function prettyPath(handle: string, slug: string): string {
  return `${hubPath(handle)}/${encodeURIComponent(slug)}`;
}
export function collectionPath(id: string): ApiPath {
  return `/api/v1/collections/${encodeURIComponent(id)}`;
}
export function permalink(id: string, token?: string): string {
  return `/c/${encodeURIComponent(id)}${token ? `?s=${encodeURIComponent(token)}` : ""}`;
}
export function queryValue(value: string | string[] | undefined, max = 4096): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}
export function authCookies(raw: string): string {
  return raw
    .split(";")
    .map((v) => v.trim())
    .filter((v) =>
      /^(?:__Secure-)?better-auth(?:\.(?:session_token|two_factor|google_connection|email_registration|account_recovery|oauth_state|state|dont_remember)|-passkey)=[^;\r\n]*$/.test(
        v,
      ),
    )
    .join("; ");
}

export function sessionCookie(raw: string): string {
  return raw
    .split(";")
    .map((v) => v.trim())
    .filter((v) => /^(?:__Secure-)?better-auth\.session_token=[^;\r\n]+$/.test(v))
    .join("; ");
}

// Server form actions use the same bounded, no-store HTTP boundary. Auth owns
// its raw protocol; only allowlisted session Set-Cookie headers cross back.
export async function postJson<T>(
  url: string,
  body: unknown,
  options: {
    headers: Headers;
    raw?: boolean;
    method?: "POST" | "PATCH" | "DELETE" | "PUT";
    timeout?: number;
    deleteBody?: boolean;
  },
): Promise<Result<T> & { setCookies?: string[] }> {
  const signal = AbortSignal.timeout(options.timeout ?? 8000);
  try {
    const response = await fetch(url, {
      method: options.method ?? "POST",
      headers: options.headers,
      ...(options.method === "DELETE" && !options.deleteBody
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
      signal,
      redirect: "error",
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      return {
        ...failure(
          isApiErrorCode(payload?.error?.code) ? payload.error.code : "unavailable",
          response.status,
          retry && /^\d+$/.test(retry) ? Number(retry) : 0,
        ),
        // A restart can cancel pending identity proof even when code issuance is limited.
        // Forward only these deletions on failure, never session creation cookies.
        setCookies: response.headers
          .getSetCookie()
          .filter((cookie) =>
            /^(?:__Secure-)?better-auth\.(?:google_connection|email_registration)=;.*; Max-Age=0(?:;|$)/.test(
              cookie,
            ),
          ),
      };
    }
    if (!options.raw && (!payload || !("data" in payload))) return failure();
    return {
      ok: true,
      data: (options.raw ? payload : payload.data) as T,
      status: response.status,
      ...(Array.isArray(payload.warnings) ? { warnings: payload.warnings } : {}),
      setCookies: response.headers
        .getSetCookie()
        .filter((v) =>
          /^(?:__Secure-)?better-auth(?:\.(?:session_token|two_factor|google_connection|email_registration|account_recovery|oauth_state|state|dont_remember)|-passkey)=/.test(
            v,
          ),
        ),
    };
  } catch {
    return failure(signal.aborted ? "request_timeout" : "unavailable");
  }
}
export function safeDocumentReturn(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) <= 32) ||
    /%2f|%5c/i.test(value.split("?")[0])
  )
    return "/";
  const url = new URL(value, "http://local.invalid");
  if (url.origin !== "http://local.invalid" || /^\/forms(\/|$)/.test(url.pathname)) return "/";
  return url.pathname + url.search;
}

export function safeReturn(value: unknown): string {
  const path = safeDocumentReturn(value);
  const parsed = new URL(path, "http://local.invalid");
  if (
    /^\/c\/[a-f0-9-]{36}$/.test(parsed.pathname) ||
    /^\/@[a-z0-9-]{3,60}\/[a-z0-9-]{2,120}$/.test(parsed.pathname)
  ) {
    const token = parsed.searchParams.get("s");
    const query = new URLSearchParams();
    if (token && /^[A-Za-z0-9_-]{1,512}$/.test(token)) query.set("s", token);
    const shareId = parsed.searchParams.get("via");
    if (shareId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(shareId))
      query.set("via", shareId);
    const itemId = parsed.searchParams.get("item");
    if (itemId && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(itemId))
      query.set("item", itemId);
    for (const key of SHARE_ATTRIBUTION_KEYS) {
      const value = parsed.searchParams.get(key);
      if (value && value.length <= 256) query.set(key, value);
    }
    const composing = parsed.searchParams.get("compose") === "comment";
    if (composing) query.set("compose", "comment");
    return `${parsed.pathname}${query.size ? `?${query}` : ""}${composing ? "#comment-composer" : ""}`;
  }
  if (/^\/c\/[a-f0-9-]{36}\/reorder$/.test(parsed.pathname)) return parsed.pathname;
  if (/^\/c\/[a-f0-9-]{36}\/sections$/.test(parsed.pathname)) {
    const section = parsed.searchParams.get("section");
    return section && isUuid(section) ? `${parsed.pathname}?section=${section}` : parsed.pathname;
  }
  if (parsed.pathname === "/share") {
    const params = parsed.searchParams;
    if (["kind", "id", "s", "returnTo"].some((key) => params.getAll(key).length > 1)) return "/";
    const kind = params.get("kind");
    const id = params.get("id");
    if (!kind || !["site", "profile", "hub", "collection"].includes(kind)) return "/";
    if (kind === "site" ? id !== null : !id || !isUuid(id)) return "/";
    const query = new URLSearchParams({ kind });
    if (id) query.set("id", id);
    const token = params.get("s");
    if (kind === "collection" && token && /^[A-Za-z0-9_-]{1,512}$/.test(token))
      query.set("s", token);
    const back = params.get("returnTo");
    if (back) query.set("returnTo", safeDocumentReturn(back));
    return `/share?${query}`;
  }
  if (/^\/capture\/[a-f0-9-]{36}$/.test(parsed.pathname)) return parsed.pathname;
  if (parsed.pathname === "/settings") {
    const section = parsed.searchParams.get("section");
    return section === "hub" || section === "notifications"
      ? `/settings?section=${section}`
      : "/settings";
  }
  if (parsed.pathname === "/manage/import-export")
    return parsed.searchParams.get("tab") === "review"
      ? "/manage/import-export?tab=review"
      : "/manage/import-export";
  if (/^\/manage\/import-export\/[a-f0-9-]{36}(?:\/rows\/[a-f0-9-]{36})?$/.test(parsed.pathname)) {
    const query = new URLSearchParams();
    const status = parsed.searchParams.get("status");
    const edit = parsed.searchParams.get("edit");
    const collection = parsed.searchParams.get("collection");
    if (isUuid(collection)) query.set("collection", collection);
    if (
      status &&
      [
        "looking_up",
        "ready",
        "failed",
        "duplicate",
        "already_saved",
        "imported",
        "skipped",
      ].includes(status)
    )
      query.set("status", status);
    if (isUuid(edit)) query.set("edit", edit);
    return `${parsed.pathname}${query.size ? `?${query}` : ""}`;
  }
  if (
    /^\/(?:account|hub|settings(?:\/security)?|notifications|discover|support|confirm|manage(?:\/(?:analytics|audit|people|team|invitations|import-export(?:\/[a-f0-9-]{36}(?:\/rows\/[a-f0-9-]{36})?)?|collections|accounts\/[a-f0-9-]{36}|collections\/[a-f0-9-]{36}))?)$/.test(
      parsed.pathname,
    )
  )
    return parsed.pathname;
  return "/";
}

// Background POST to one of the web's own native-form actions (same origin,
// URL-encoded like a form, no API path). Used where a page records something
// on view, e.g. Notifications marking items seen.
export async function postFormAction(action: string) {
  if (!/^[a-z-]+$/.test(action)) throw new Error("Invalid form action");
  try {
    const response = await fetch(`/forms/${action}`, {
      method: "POST",
      credentials: "same-origin",
      redirect: "manual",
      body: new URLSearchParams(),
    });
    return response.ok;
  } catch {
    return false;
  }
}
