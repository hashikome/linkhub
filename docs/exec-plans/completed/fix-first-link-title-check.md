# First-link title lookup and validation

## Purpose / Big Picture

The signed-out Save your first link form must resolve a page title and validate
its public address just like the signed-in form. Rich previews belong on saved
collection items, not in this form (user clarification, 2026-10-08). Saving still
requires email verification. Valid pages without available titles remain saveable.

## Progress

- [x] (2026-10-08) Trace missing titles to the client lookup flag and API auth guard.
- [x] (2026-10-08) Enable public title/status lookup; preserve SSRF and source-budget
  boundaries; report lookup failures without blocking valid addresses.
- [x] (2026-10-08) Add API and browser regression coverage and update product docs.
- [x] (2026-10-08) Run full verification/browser gates, inspect screenshots and record results.

## Surprises & Discoveries

The existing endpoint returns only a canonical URL, title and validation status,
although its internal name is link-preview. It does not return rich preview cards.
Express accepts route casing/trailing-slash variants; budget classification must
normalize both so the public lookup limit cannot be bypassed through route spelling.

## Decision Log

- 2026-10-08 / User: title resolution and link validation are the baseline for
  saving, including before sign-in; rich previews belong in collections.
- 2026-10-08 / Codex: reuse the existing bounded lookup and shared metadata cache,
  retaining public-address and outbound-fetch checks. No collection access or
  credential requirement changes. Record this feature rule in its focused design.

## Outcomes & Retrospective

Implemented and verified. The form resolves titles and validates addresses
before sign-in, with a visible fallback on lookup failure and no rich cards. The People and hubs milestone
remains separate and uncommitted in the same working tree.

## Context And Orientation

`CaptureForm` supplied an authentication-dependent lookup flag to `CaptureLinks`.
`LinkPreviewController` additionally required authentication. The existing
request-budget middleware bounds lookups to 30/minute per source; page-metadata
fetching owns DNS pinning, redirect validation, timeouts and response-size caps.

## Plan Of Work

Remove both authentication gates for title/status lookup. Retain authenticated
capture writes. Handle a failed lookup visibly and avoid stale requests clearing
a newer loading state. Cover anonymous title reads, invalid URLs, equivalent-route
rate limits, anonymous browser rendering and continued verification on saving.

## Concrete Steps

Run `bun run check`, `bun run verify` and `bun run test:browser` in the isolated
verification checkout, preserving the running development server's build output.
Inspect `/tmp/first-link-title-dark.png` and `/tmp/first-link-title-mobile.png`.

## Validation And Acceptance

Anonymous forms show the known page title, block invalid public addresses and
show a nonblocking failure message when lookup is unavailable. Only title/status
appears, not descriptions or rich cards. API title reads create no accounts or
hubs; authenticated saving and source-based rate limits remain enforced.

## Idempotence And Recovery

No migration, dependency or production configuration change. Tests use disposable
databases and restore temporary lookup settings. Leave changes uncommitted for review.

## Artifacts And Notes

- `bun run verify`: passed; log `/tmp/nslinkhub-first-title-verify.log`.
- `bun run test:browser`: 45 passed, zero failed; log
  `/tmp/nslinkhub-first-title-browser.log`. The new regression covers a signed-out
  title lookup, invalid address, failed lookup and email verification before save.
- API coverage confirms cached anonymous titles create no accounts/hubs, public
  address validation remains enforced, and case/trailing-slash route variants
  share the 30/minute lookup budget.
- Visually inspected desktop and phone screenshots showing only the title below
  the address, with readable dark-theme contrast and no overflow.
- Reproduced the user's URL in the running development app without a session:
  “Why WorkLog became a notebook” appears below its address. Screenshot:
  `/tmp/first-link-title-local.png`. The dev watcher had retained the old client
  module; touching the changed source triggered its rebuild without restarting
  the user's development processes.

## Interfaces And Dependencies

Reuse `GET /api/v1/link-preview?url=` and the existing `LinkPreview` wire shape.
This is public URL metadata, not a collection-resource read or permission grant.
