# Edge-cached public pages and intent route code

## Purpose / Big Picture

Live requests from East Africa reach Cloudflare's Cape Town edge (~80ms) and then
a European origin (~130–150ms more); every page is `private, no-store`, so every
document pays both. Two changes reduce what users wait for without moving the
server (the owner accepts the origin location for now; relocating it later needs
no code change):

1. Signed-out visitors receive public pages (home, About, Discover, published
   collections, public hubs and profiles) from Cloudflare's edge.
2. Hovering, focusing or pressing an internal link loads that route's JavaScript
   in advance, so a first visit no longer waits for the page data and then its code.

## Progress

- [x] (2026-10-13) Owner selected both changes after the live latency review.
  Inspected build manifests, layouts, cookies and Cloudflare documentation.
- [x] (2026-10-13) Route code preloading: post-build manifest, intent loader, unit
  tests and a production-browser test (hover fetches only build assets; the page
  chunk is a cache hit on navigation; document kept).
- [x] (2026-10-13) Edge caching: origin eligibility, per-request failure scope,
  unit tests and a production-browser test; ADR-0066 and the edge-cache runbook.
- [ ] Owner applies the Cloudflare Cache Rule in the dashboard (13 October 2026: the
  operator API token has no zone Cache Rules permission); live verification with
  the runbook checks after the deployment.

## Surprises & Discoveries

Next 16 (webpack) emits no app-build manifest. Each route's
`page_client-reference-manifest.js` lists client modules with their chunk files,
including the page's own chunk; that is sufficient to derive per-route code.

Next's `router.prefetch` cannot fetch code without data for these force-dynamic
routes: it renders layouts (including the session-dependent root layout) for the
prefetch payload. ADR-0064 forbids speculative private prefetch, so it stays off.

The root layout reads the `resource_same_tab` device cookie even for signed-out
visitors, so a visitor carrying it must bypass the edge cache, like a session.

Error notices render with HTTP 200, so a rate-limited or failed render could have
been shared with everyone. Every server API call now runs inside a per-request
scope (AsyncLocalStorage on a global symbol, shared with Next's bundle); a failed
or writing call keeps the response private. A production-browser test confirms
the scope survives Next's rendering under Bun.

Under Bun, `getHeader("set-cookie")` returns `[]` when unset (Node: `undefined`);
the first implementation treated that as a cookie and never marked pages public.

The first push failed the release-image check: `server.ts` imported the request
scope from `src/lib/`, which the production web image does not contain (it ships
`server/`, `server.ts` and `.next`). The scope moved to `apps/web/server/`, and the
image check now asserts the edge policy on `/about` and its absence with a session
cookie, so this class of breakage fails before deployment. Nothing was deployed.

## Decision Log

- 2026-10-13: Preload code only (immutable `/_next/static` files), never RSC data.
  Hover waits 80ms of intent; focus, pointerdown and touchstart preload at once.
- 2026-10-13: The origin decides cacheability per response; Cloudflare caches
  only what the origin marks public and bypasses whenever an app cookie exists.
  Defaults: `s-maxage=60, stale-while-revalidate=60` (browsers keep `max-age=0`).
  Consequence: unpublishing or a distribution hold can take up to ~2 minutes to
  disappear for signed-out visitors. Purging on those writes is a follow-up.
- 2026-10-13: Cache HTML documents only; client-router (RSC) requests and any URL
  with a share token, preview view or unknown query parameter stay private.

## Context And Orientation

`apps/web/server.ts` is the custom Node server in front of Next; it can see every
request and rewrite response headers before they are sent. `next.config.ts` marks
all non-static paths `private, no-store`. `src/app/layout.tsx` reads the session,
profile, appearance and `resource_same_tab` cookies. `src/components/app-navigation.tsx`
owns in-app link handling. Public routes: `/`, `/about`, `/discover`, `/c/[id]`,
`/h/[id]`, `/[handle]` (`@handle` hubs and person usernames) and `/people/[id]`.
Top-level static routes (for example `/capture`) are never usernames.

## Plan Of Work

Route code: a post-build script reads every page's client-reference manifest and
writes `.next/static/route-chunks/<BUILD_ID>.json` (route pattern → chunk URLs not
shared by every route). The root layout passes that URL to `AppNavigation`, which
fetches it at idle and, on link intent, fetches the matched route's chunks with low
priority into the HTTP cache.

Edge caching: a pure eligibility function (method, path allowlist, no app cookies or
Authorization, no RSC headers, allowed query keys) plus a response hook in
`server.ts` that, for eligible requests answered 200 without `Set-Cookie`, replaces
Cache-Control with the public edge policy. A unit test pins the reserved top-level
route list to `src/app`. A runbook section specifies the Cloudflare Cache Rule.

## Concrete Steps

`bun run --filter @ntumie/web test`; focused production browser checks with
`bun run verify:isolated test:browser --test-name-pattern ...`; full
`bun run verify:isolated`. After the owner applies the Cloudflare rule, verify with
`curl -sI https://ntumie.link/about` (expect `cf-cache-status: HIT` on repeat) and
the same request with a session cookie (expect `BYPASS` or `DYNAMIC`).

## Validation And Acceptance

- Hovering a link to an unvisited route fetches only `/_next/static` files; no RSC,
  page or API request happens before the click. Navigation then needs no chunk fetch.
- Signed-out public pages carry the public edge policy; any session/appearance/
  device cookie, Authorization, RSC request, share token, non-200 or Set-Cookie
  response stays `private, no-store`.
- Existing critical browser journeys and the full verification gate pass.

## Idempotence And Recovery

Code changes only; no data migration. Without the Cloudflare rule the new headers
have no edge effect (Cloudflare does not cache HTML by default). Rollback: remove
the Cache Rule, then revert the origin hook; purge the zone cache if needed.

## Outcomes & Retrospective

(To be completed.)

## Artifacts And Notes

Live measurements of 13 October 2026 are recorded in the tech-debt tracker.

## Interfaces And Dependencies

Next.js 16 webpack build output (`page_client-reference-manifest.js`, `BUILD_ID`),
Node `http.ServerResponse`, Cloudflare Cache Rules. No new dependencies.
