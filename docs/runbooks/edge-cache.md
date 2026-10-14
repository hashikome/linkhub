# Edge cache for signed-out public pages

The web origin marks a response `public, max-age=0, s-maxage=60,
stale-while-revalidate=60` only when all of these hold (`apps/web/server/edge-cache.ts`,
ADR-0066):

- a GET/HEAD document request for `/`, `/about`, `/discover`, `/c/<id>`, `/h/<id>`,
  `/people/<id>`, `/@<handle>` or `/<username>`;
- no cookies except Cloudflare's own, no Authorization, no client-router (RSC) headers;
- query keys limited to `cursor`, `item`, `cc`, `rt`, `rc`, `via`, `notice`, `compose`
  (share tokens `s`, previews `view` and `_rsc` stay private);
- the render answered 200 with HTML, set no cookie and every API read succeeded.

Everything else stays `private, no-store`. Browsers never reuse these pages
(`max-age=0`); only the edge does.

## Cloudflare Cache Rule (zone `ntumie.link`)

Cloudflare does not cache HTML by default, so the origin headers have no effect
until this rule exists. Create one Cache Rule, placed before any other rule that
touches these paths:

- **Name:** `Signed-out public pages`
- **When incoming requests match** (expression editor):

  ```text
  (http.host eq "ntumie.link"
   and http.request.method in {"GET" "HEAD"}
   and not starts_with(http.request.uri.path, "/api/")
   and not starts_with(http.request.uri.path, "/_next/")
   and not starts_with(http.request.uri.path, "/forms/")
   and not http.cookie contains "better-auth"
   and not http.cookie contains "appearance"
   and not http.cookie contains "resource_same_tab")
  ```

- **Cache eligibility:** Eligible for cache.
- **Edge TTL:** Use cache-control header if present, bypass cache if not.
- **Browser TTL:** Respect origin TTL.
- **Cache key:** defaults (the full query string is part of the key).

The cookie clauses are the safety boundary for signed-in visitors: without them
Cloudflare could answer a signed-in request with a cached signed-out page (a wrong
shell, never another person's data, because the origin only marks signed-out
renders public). Keep them in step with `EDGE_BYPASS_COOKIES`.

## Verify after deployment and rule creation

```bash
curl -s -o /dev/null -D - https://ntumie.link/about | grep -iE 'cache-control|cf-cache-status'
curl -s -o /dev/null -D - https://ntumie.link/about | grep -i cf-cache-status   # HIT
curl -s -o /dev/null -D - -H 'Cookie: better-auth.session_token=x' https://ntumie.link/about \
  | grep -iE 'cache-control|cf-cache-status'                                   # no-store; DYNAMIC
curl -s -o /dev/null -D - https://ntumie.link/capture | grep -i cf-cache-status  # BYPASS
```

The first request after a deployment or expiry is a `MISS` (public policy); a repeat
within a minute is a `HIT`. `BYPASS` means the rule matched but the origin answered
`private, no-store`; `DYNAMIC` means the rule did not match (an app cookie, `/api/`,
`/_next/`, `/forms/`). Do not add a cache-busting query such as `?v=1`: unknown query
keys keep the page private by design, so the result is always `BYPASS`.

Verified live on 14 October 2026: `/`, `/about`, `/discover` and a published
collection went `MISS` then `HIT`; `?s=`, unknown query keys, RSC requests, an
unknown profile (404), `/capture` and `/sign-in` stayed `private, no-store`
(`BYPASS`); session and appearance cookies gave `DYNAMIC`.

## Staleness and rollback

Signed-out visitors may see a page up to about two minutes old: an unpublished
collection, a distribution hold or a renamed hub can take that long to disappear
from the edge. Purge `https://ntumie.link/c/<id>` (or the zone) in the Cloudflare
dashboard when a change must vanish immediately. To roll back, disable the Cache
Rule and purge the zone; the origin change alone caches nothing.
