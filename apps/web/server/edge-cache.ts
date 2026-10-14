import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import type { EdgeCacheScope } from "./edge-cache-scope";

// Signed-out public pages may be served from Cloudflare's edge. The origin decides
// per response: only an eligible request answered 200 with HTML and no Set-Cookie
// is marked public; everything else keeps `private, no-store`. Cloudflare must
// bypass its cache whenever a request carries one of EDGE_BYPASS_COOKIES (see
// docs/runbooks/edge-cache.md), because those cookies change what the shell renders.
export const PUBLIC_EDGE_POLICY = "public, max-age=0, s-maxage=60, stale-while-revalidate=60";
export const EDGE_BYPASS_COOKIES = ["better-auth", "appearance", "resource_same_tab"] as const;

// Top-level static paths; any other username-shaped segment is a person profile.
// A unit test keeps this in step with apps/web/src/app.
export const RESERVED_TOP_LEVEL = new Set([
  "about",
  "account",
  "api",
  "capture",
  "confirm",
  "discover",
  "forms",
  "healthz",
  "hub",
  "invitations",
  "manage",
  "notifications",
  "people",
  "settings",
  "share",
  "sign-in",
  "sign-up",
  "status",
  "support",
]);

// Cloudflare's own bot/load-balancing cookies never affect rendering.
const edgeCookie = /^(?:__cf_bm|cf_clearance|_cfuvid|__cflb|__cfruid|__cfseq-[\w-]+)$/;
// Share tokens (s), owner previews (view), router payloads (_rsc) and anything
// unknown stay private.
const publicQuery = new Set(["cursor", "item", "cc", "rt", "rc", "via", "notice", "compose"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicPagePath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/about" || pathname === "/discover") return true;
  const parts = pathname.split("/");
  if (parts.length === 3 && ["c", "h", "people"].includes(parts[1])) return uuid.test(parts[2]);
  if (parts.length !== 2) return false;
  const segment = parts[1];
  if (/^(?:@|%40)[a-z0-9-]{3,60}$/.test(segment)) return true;
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment) &&
    segment.length >= 3 &&
    segment.length <= 20 &&
    !RESERVED_TOP_LEVEL.has(segment)
  );
}

export function edgeCacheable(
  method: string | undefined,
  url: string | undefined,
  headers: IncomingHttpHeaders,
) {
  if ((method !== "GET" && method !== "HEAD") || !url) return false;
  for (const name of [
    "authorization",
    "rsc",
    "next-action",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-router-state-tree",
  ])
    if (headers[name] !== undefined) return false;
  for (const part of (headers.cookie ?? "").split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name && !edgeCookie.test(name)) return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url, "http://origin.invalid");
  } catch {
    return false;
  }
  if (parsed.origin !== "http://origin.invalid") return false;
  for (const key of parsed.searchParams.keys()) if (!publicQuery.has(key)) return false;
  return publicPagePath(parsed.pathname);
}

function headerValue(
  inline: OutgoingHttpHeaders | undefined,
  response: ServerResponse,
  name: string,
) {
  if (inline)
    for (const [key, value] of Object.entries(inline)) if (key.toLowerCase() === name) return value;
  return response.getHeader(name);
}

// Bun reports an unset Set-Cookie as an empty array; Node as undefined.
function hasValue(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "";
}

// Rewrites Cache-Control just before headers are sent, once Next has decided the
// status, content type and cookies of the response.
export function applyEdgeCachePolicy(
  request: IncomingMessage,
  response: ServerResponse,
  scope: EdgeCacheScope = { cacheable: true },
) {
  if (!edgeCacheable(request.method, request.url, request.headers)) return;
  const writeHead = response.writeHead;
  response.writeHead = function (this: ServerResponse, statusCode: number, ...rest: unknown[]) {
    const inline = rest.find(
      (value): value is OutgoingHttpHeaders =>
        typeof value === "object" && value !== null && !Array.isArray(value),
    );
    const raw = rest.some((value) => Array.isArray(value));
    const contentType = String(headerValue(inline, this, "content-type") ?? "");
    if (
      scope.cacheable &&
      !raw &&
      statusCode === 200 &&
      !hasValue(headerValue(inline, this, "set-cookie")) &&
      contentType.startsWith("text/html")
    ) {
      this.setHeader("Cache-Control", PUBLIC_EDGE_POLICY);
      if (inline)
        for (const key of Object.keys(inline))
          if (key.toLowerCase() === "cache-control") inline[key] = PUBLIC_EDGE_POLICY;
    }
    return (writeHead as (...args: unknown[]) => ServerResponse).call(this, statusCode, ...rest);
  } as typeof response.writeHead;
}
