# ADR-0064: Client navigation and interactive forms

Status: Accepted
Date: 2026-10-13

## Context

The owner reported that ordinary links, edits and even appearance changes reload
the document. Native document navigation and mandatory JavaScript-free parity
were making routine interaction disruptive. The owner explicitly prioritized
UI/UX and removed that parity requirement.

## Options Considered

- Keep native-only navigation and hide its loading: does not preserve the document.
- Rewrite each command as a separate client API: duplicates existing continuation,
  validation, cookie and sign-in recovery contracts.
- Use the App Router and a shared asynchronous form boundary: selected.

## Decision

JavaScript is the supported interactive web experience. Native links/forms may
remain as inexpensive fallbacks, but they do not dictate interaction or require
parallel acceptance for every new feature.

Use Next.js client navigation for same-origin page links and GET forms. Preserve
modified clicks, fragments, external destinations, downloads and provider
redirects. Do not prefetch private pages speculatively. Show quiet pending feedback
and keep the current page usable during ordinary navigation.

Submit commands through the existing same-origin `/forms` boundary in the
background. Interactive submissions receive a JSON continuation instead of a
redirect; preserve all response cookies. Refresh server output after writes,
without replacing the browser document. Existing specialized inline saves retain
control of their forms. Failed requests preserve inputs, describe uncertainty and
never automatically repeat writes. Ignore late continuations after leaving a form.

Apply appearance immediately, persist it through the same authenticated cookie
endpoint, and restore the saved appearance with feedback if persistence fails.

The API remains the permission/business-rule authority. Reads stay uncached.
History restoration, long-away returns and detected session changes conceal stale
protected content until a server refresh completes. Refreshed lists reconcile
server snapshots and discard obsolete reads. No persistent browser data cache.

## Supersession And Constraints

This supersedes ADR-0003's native-first/JavaScript-free requirement, ADR-0048's
full-document navigation/cancel recovery mechanics, and ADR-0063's theme reload.
Backend authority, same-origin validation, secure cookies, share-token scope,
accessible semantics, focus and keyboard behavior remain binding.

## Amendment — 13 October 2026

Navigating and then refreshing rendered a write's destination twice on the server.
The `/forms` continuation now carries `refresh`: it is `false` only for an
allowlist of actions that cannot change layout data (session, profile, notification
count, appearance, device preferences) and only when no such cookie is set; the
client then navigates without the full-tree refresh. Unknown or missing values
refresh. GET forms are reads and no longer refresh. Same-URL continuations,
history restoration and session changes still refresh.

## Amendment — route code on intent (13 October 2026)

Hovering (80ms), focusing, pressing or touching an internal link fetches that
route's JavaScript chunks from a post-build manifest of immutable `/_next/static`
files, so a first visit does not wait for the page response before requesting its
code. This loads code only: no RSC payload, page render, cookie-dependent output or
API read happens before navigation, so the no-speculative-private-prefetch rule
stands. Data Saver disables it. Next's `router.prefetch` stays unused because it
renders the session-dependent layouts.

## Consequences

The shell and browser document survive routine actions. Client state must now
respond to changed server props; a full document reload no longer implicitly
resets lists, toasts or pending controls. Browser acceptance must assert document
identity as well as visible results, failures and authorization changes.

See [the interface contract](../design-docs/web-interface-system.md) and
[implementation plan](../exec-plans/completed/smooth-client-navigation.md).
