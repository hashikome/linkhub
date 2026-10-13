# ADR-0066: Edge-cached public pages for signed-out visitors

Status: Accepted
Date: 2026-10-13

## Context

Every document was `private, no-store`. Live visitors in East Africa reach
Cloudflare's Cape Town edge and then a European origin, so each document paid the
edge-to-origin hop (~130–150ms) even for identical signed-out public pages. The
owner accepts the origin location for now.

## Options Considered

- Keep all documents private: simplest, every visit pays the origin hop.
- Let Cloudflare decide from paths and cookies alone: one misconfigured rule could
  cache a personalised response.
- Origin decides per response, Cloudflare caches only what the origin marks public
  and bypasses whenever a shell-affecting cookie is present: selected.

## Decision

The web server marks a response `public, max-age=0, s-maxage=60,
stale-while-revalidate=60` only for a signed-out GET/HEAD document on an allowlisted
public path with allowlisted query keys, with no app cookie, Authorization or
client-router header, answered 200 with HTML, without Set-Cookie, and only when
every API call made while rendering succeeded and none wrote. Everything else
stays `private, no-store`. A Cloudflare Cache Rule makes those paths eligible and
bypasses on session, appearance and device-preference cookies
([runbook](../runbooks/edge-cache.md)). Client-router payloads are never shared.

## Consequences

Signed-out public pages can be served from the edge. Unpublishing, holds and
renames can take about two minutes to disappear there for signed-out visitors;
purge when a change must vanish immediately (purge-on-write is a follow-up).
Streamed discussion that fails after headers are sent may be cached for that
window. A cookie that changes public-page rendering must join the bypass list.
Signed-in requests always reach the origin; authorization is unchanged.
