# ADR-0054: Preserve native input and measure browser readiness

**Status:** accepted
**Date:** 2026-10-11

## Context

Server-rendered capture fields accept input before React attaches handlers.
Initializing enhanced state only from server props leaves early URLs visible but
unobserved by preview logic, and replacing the native tag editor can discard tags.
Browser verification also ran different default Chrome versions locally and in CI;
failed runners discarded their diagnostics. Production latency had no measured
baseline. A five-second assertion timeout is not a page-load measurement.

## Decision

Keep native URL/tag inputs and native submit usable before JavaScript. Enhancements
adopt live input, preserving an active tag draft and selection. Existing commas
in an adopted draft do not commit subsequent ordinary typing; Enter, an explicit
comma key or leaving the editor commits the draft. JS-only add/remove
controls remain disabled until ready. Add deterministic coverage holding scripts
until after typing, including native submission before releasing the scripts.

Use the Playwright package's pinned full Chromium (`channel: "chromium"`)
in headless mode locally and in CI, with only an
explicit `BROWSER_CHROME_PATH` override. Keep browser acceptance a separate required
web-milestone and CI gate; the pre-push hook continues to run `verify`.

Retain sanitized failed-context action timing traces, masked screenshots of
non-authentication pages and request waterfalls. Exclude trace arguments, errors,
DOM snapshots, request/response bodies, headers and query strings. Authentication,
account, recovery and security screenshots are excluded. Raw traces exist only
inside owned temporary directories and are deleted before artifact publication.
Finalize diagnostics in Bun’s test-finished hook, including runner-enforced
timeouts that never reject the test body. Snapshot completion before late async
work can succeed; keep contexts and cleanup owned by their original test.
CI retains diagnostic artifacts for seven days. Never upload fixture email or
raw server logs, which may contain proof material.

Measure repeated production journeys using disposable data, cold and warm browser
caches, and explicit network/CPU throttling. A User Timing mark
`app:document-ready` identifies installation of the shared document lifecycle
handlers, not completion of every client component. Report backend durations,
asset timings and document events separately. Do not convert machine-specific
measurements into flaky pass/fail speed thresholds.

## Consequences

Slow JavaScript no longer prevents native capture. Traces retain action order and
duration but intentionally omit selectors/arguments and DOM replay; the separate
masked screenshot and sanitized waterfall supply visual/network context.
The established [navigation policy](0048-nonblocking-navigation-progress.md) and
fresh backend authorization remain in force. Broader navigation/cache changes
require separate evidence and an explicit decision.

## Measured optimization within this boundary

Initial production measurements found two profile reads on both capture and
Settings, and `private, no-store` on actual hashed JS/CSS responses. Share the
profile **result** within the React server request so failure/401 behavior stays
available to each caller; never cache it across requests or users. Exempt only
`/_next/static/` from the broad no-store override, allowing Next's immutable build
asset headers. Keep security headers on every path and no-store on documents,
forms and other paths. This narrows the static-asset scope of the no-store policy;
it does not relax ADR-0048's fresh content/authorization rule. Browser acceptance
asserts immutable asset headers, one profile read, cross-user isolation and fresh
signed-out/invalid-session redirects.

The full Chromium channel follows [Playwright’s new headless guidance](https://playwright.dev/docs/browsers#chromium-new-headless-mode).
A local acceptance run recorded a kernel compositor trap in `chrome-headless-shell`;
using the full browser also better matches normal browsing. Failed requests retain
only a normalized route and a generic network error code.
