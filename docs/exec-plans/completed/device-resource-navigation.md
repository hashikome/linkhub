# Choose resource navigation per browser

This ExecPlan is maintained according to `PLANS.md`.

## Purpose / Big Picture

Open external resource links in new tabs by default, keeping the collection
available while readers explore another site. Settings → On this device offers
an explicit opt-in to open them in the same tab. A mobile browser can opt in
while the same account's desktop browser keeps its default.
All LinkHub destinations stay in the same tab, regardless of content ownership.

## Progress

- [x] (2026-10-11) Confirmed per-device scope; subsequently reversed the initial
  same-tab default at the user's request after their return-navigation discovery.
- [x] (2026-10-11) Implemented the browser cookie, server-rendered link targets,
  settings section and native/enhanced save path.
- [x] (2026-10-11) Added native/enhanced browser journeys, independent-context
  coverage and durable product/design documentation.
- [x] (2026-10-11) Passed the final isolated standard gate, including the audit
  fixture corrections, production build and typechecking.
- [x] (2026-10-11) Completed production-browser acceptance: 98 journeys passed
  in the full run; two stale exact-name assertions were corrected and their
  complete journeys passed on targeted rerun. One optional benchmark skipped.
- [x] (2026-10-11) Passed isolated development-preview acceptance and final API
  typechecking with incremental output disabled.
- [x] (2026-10-11) Inspected the finished diff and desktop/mobile screenshots;
  prepared both repositories for user review without committing or pushing.

## Surprises & Discoveries

- Ordinary external-link resources can contain absolute LinkHub URLs. Destination
  origin, rather than resource kind or collection ownership, decides tab behavior.
- Existing settings sections keep profile drafts mounted during enhanced section
  changes. The separate preference form must preserve that behavior.
- The revised standard gate found an unrelated audit-pagination fixture collision:
  its one-millisecond window was only one second behind preceding test activity.
  Moving that synthetic window to the previous day isolates it from live fixture
  events. The operations suite passed all 25 tests in isolation, but the full
  gate also exposed an unbounded search expectation once these fixtures were
  older than previous suites’ records. Both search assertions now use the same
  fixture window. The final full standard gate passed both checks. No audit
  implementation changed. A concurrent gate also hit
  the existing five-second hold-pagination test timeout; final gates run
  sequentially to avoid that contention.

- Existing demo and item-detail tests used exact accessible link names without
  the new-tab hint. Updated those expectations and checked popup/new-tab targets.
  The final full browser run had 98 passes and two remaining old-name failures;
  only those assertions changed afterward, and both complete journeys passed
  in a targeted production-browser rerun. Application code did not change.

## Decision Log

- Decision: External resources open in new tabs by default; the device option
  selects same-tab navigation. This supersedes the initial unshipped default.
  Rationale: The user explored multiple pages after leaving LinkHub and found
  returning required retracing that history. A separate tab preserves the
  collection, while the override accommodates mobile and other preferences.
  Date/Author: 2026-10-11 / user
- Decision: Store a one-year, host-only, HTTP-only preference cookie; clear it to
  restore the default. It belongs to the browser, including after sign-out, not
  to an account or database row. Clearing browser data also resets the preference.
  Rationale: Explicitly requested device independence; reading it during rendering
  gives correct native links before hydration and without JavaScript.
  Date/Author: 2026-10-11 / user direction, Codex implementation
- Decision: Use native anchors with a target, no opener/referrer, and an accessible
  new-tab hint. Preserve normal modifier-key and browser-menu behavior.
  Rationale: Avoid script-dependent navigation and popup races.
  Date/Author: 2026-10-11 / Codex

## Outcomes & Retrospective

External resources now open in new tabs by default. The browser-specific
same-tab preference works with native and enhanced forms, initial server HTML
and paginated rows; LinkHub destinations remain same-tab. Implementation,
standard verification, browser coverage, development-preview acceptance and
visual inspection are complete. Changes remain uncommitted for user review. The user additionally requested
a portfolio notebook draft; `why-i-changed-my-mind-about-new-tabs.md` was created
unpublished in the sibling portfolio with an editorial queue entry. Its public
and preview builds and seven notebook tests passed; it is absent from public HTML.

## Context And Orientation

`apps/web/src/components/primitives.tsx` renders resource destinations, including
rows appended through `resource-sections.tsx`. `app/layout.tsx` reads browser
preferences on each document request. `profile-editor.tsx` owns the settings
navigation and keeps account drafts mounted. `app/forms/[action]/route.ts` owns
native form submissions with same-origin/body-size validation. The browser
acceptance harness in `apps/api/test/browser/reading.browser.ts` runs a production
web build against disposable services and captures failure diagnostics.

## Plan Of Work

Add a narrowly scoped resource-navigation provider initialized by the server,
and a resource anchor that compares its destination with the public web origin.
Add an On this device settings section with a native checkbox and Save preference;
enhance submission without navigating away from unsaved account drafts. Validate
and persist the setting at the existing web form boundary. Document the behavior
and test independent browser contexts, native and enhanced saves, pagination,
internal destinations, and actual popup/referrer behavior.

## Concrete Steps

Run from the repository root with PostgreSQL/Redis already available:

```bash
TMPDIR="$PWD/test-results/t" bun run verify:isolated
TMPDIR="$PWD/test-results/t" bun run verify:isolated test:browser
TMPDIR="$PWD/test-results/t" bun run verify:isolated test:dev
# After correcting the two exact accessible-name assertions:
TMPDIR="$PWD/test-results/t" bun run verify:isolated test:browser --test-name-pattern 'opens items beyond the first page'
```

The standard and development gates passed. Browser acceptance combines the
full run with the two corrected journeys rerun explicitly; see the results below.
The short temporary directory avoids the host's `/tmp` quota and Chromium socket
path limits. Logs belong in ignored `test-results/`.

## Validation And Acceptance

- External resources open in new tabs unless same-tab is enabled in that browser.
- A second browser with the same account retains the default.
- Saving, persistence and reset work with and without JavaScript.
- External resource links open a new tab with no opener or referrer by default;
  internal collection references and absolute LinkHub URLs remain same-tab.
- Server HTML and paginated resources honor the preference. Failed saves retain
  the attempted choice and report failure. Small-screen settings do not overflow.

## Idempotence And Recovery

No migration, account setting or API contract changes. Removing the preference
cookie resets behavior. Verification uses owned disposable checkouts/databases;
do not disturb the user's development listeners or root `.next`. Preserve the
pre-existing `apps/web/next-env.d.ts` modification. Leave the milestone uncommitted
for user review.

## Artifacts And Notes

Screenshots at 390 and 1280 pixels were visually inspected. Feature rules are
recorded in the web design documents, following the ADR index convention for
feature-level guidance; no architectural invariant is changed.

- `test-results/device-verified.log`: full standard gate passed.
- `test-results/device-browser-verified.log`: 98 pass, 2 old-name assertion
  failures, 1 optional benchmark skip, 1,969 assertions, 722.35 seconds.
- `test-results/device-item-browser.log`: both corrected journeys passed,
  26 assertions, 18.97 seconds. No application change between these browser runs.
- `test-results/device-dev-verified.log`: isolated API/worker/web readiness,
  preview links, native sign-in redirect, direct API/CORS and shutdown passed.
- `test-results/device-final-api-typecheck.log`: final test-source typecheck passed.
- `test-results/device-notebook-{public,preview,tests}.log`: portfolio builds
  and seven notebook tests passed; the draft was excluded from all public HTML
  and present with noindex in the separate preview.

The notebook source is in the sibling portfolio at
`../../namestarlit/namestarlit.com/src/content/notebook/why-i-changed-my-mind-about-new-tabs.md`.
It remains `published: false`; no deployment or publication was performed.

## Interfaces And Dependencies

`resource_same_tab=on` is a web-only cookie. Its absence/invalid value means
external resources open in new tabs.
`POST /forms/device-preferences` accepts an optional single `resourceSameTab=on`
field; native callers receive a settings redirect, enhanced callers a confirmed
boolean. No new dependencies, backend rules or authorization caching are added.
