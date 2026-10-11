# Separate Manage navigation from import workflows

## Purpose / Big Picture

Reduce stacked headers by moving Manage sections to a desktop sidebar. Put subsections beneath their section. Import has New import and Review views; Review
lists all unfinished imports and provides open/discard actions.

## Progress

- [x] (2026-10-11) Implemented shared sidebar, native mobile menu and permanent Review list.
- [x] (2026-10-11) Initial sidebar workflow passed 4 browser tests / 121 assertions. Final four subsection/import workflows also pass.
- [x] (2026-10-11) Inspected final 390/768/1280/1440 screenshots in light/dark, including expanded mobile menu, selected rows, inline errors and empty states.
- [x] (2026-10-11) Navigation regression passes (16 assertions): no app loading UI during a held response, cancellation recovery, fresh authorization including revoked access.
- [x] (2026-10-11) Sequential `bun run verify:isolated` passed: static checks, API/unit/integration tests, web tests, production build and final typecheck.

## Surprises & Discoveries

The existing navigation component intentionally hid the entire page after 300ms,
including harmless GET navigation. Development compilation made this frequent.
A second session read in Manage bypassed request-scoped memoization. The final
change keeps ordinary navigation visible and removes those redundant waits.

The first canonical run hit the existing operations pagination test’s five-second
timeout while browser verification ran concurrently. Retry suites sequentially.

The held-navigation test must observe the old document using a preinstalled timer;
Playwright evaluations during pending navigation wait for the new document. The
recovery assertion scopes its alert to avoid Next’s separate route announcer.

Tests caught outdated heading assertions and an ambiguous mobile summary selector
after nesting disclosures; use the direct mobile summary and the level-one heading.

Every Manage page previously rendered its own navigation. A shared layout now
owns it. Server-rendered pathname-aware links preserve active navigation without
JavaScript; role eligibility still comes from the server session.

## Decision Log

- 2026-10-11: User requested a sidebar inspired by the supplied Cloudflare view.
  Keep the global site header; move Manage navigation. The later screenshot
  feedback also moves Import subsections into the sidebar so headings start each view.
- 2026-10-11: User removed Drafts as a separate tab. Review lists all unfinished
  imports, including processing ones, with existing counts and discard controls.
  This supersedes the contextual closable Review tab in the preceding milestone.

- 2026-10-11: Parent sections with children expand without navigating. Native
  details/summary preserves keyboard and JavaScript-free use; leaf links navigate.

- 2026-10-11: User reported frequent full-page loading. Ordinary GET navigation
  now retains the authorized current view; mutations, cancellation and session/history
  revalidation still conceal it. Reuse request-local session memoization and run
  independent import summary/row reads concurrently. No shared data cache added.

- 2026-10-11: User requested browser-native loading feedback only. Remove the app
  spinner and slow-response timer; retain interruption recovery and actual error views.

## Outcomes & Retrospective

Completed. Manage uses expandable sidebar subsections with permanent New import
and Review destinations. Ordinary navigation retains the current view with
browser-native progress only; interruptions and actual failures retain recovery.
Focused browser checks and the full isolated gate pass. No commits or pushes made.

## Context And Orientation

`apps/web/src/app/manage/layout.tsx` owns the workspace. `operator-ui.tsx` derives
permitted navigation; `manage-navigation.tsx` marks the active path. Import subsection
navigation lives in `manage-navigation.tsx`; the import index renders upload or review list.

## Plan Of Work

Extract the common navigation into the layout, preserve role-scoped links and
native mobile disclosure, then consolidate Drafts into Review. Update docs/tests
and inspect real pages at four widths in both themes.

## Concrete Steps

Run `bun run check`, focused `bun run verify:isolated test:browser -t` covering
import and Manage navigation, then `bun run verify:isolated` from repository root.

## Validation And Acceptance

Manage navigation highlights nested routes, exposes only eligible sections and
works without JavaScript. Desktop tables stay viewport-bounded. At 390/768px a
collapsible menu replaces the sidebar; 1280/1440px show it beside the content.
New import and Review remain visible; Review opens and discards unfinished
imports. Existing Drafts URLs redirect. Refresh stays first in the action footer.

## Idempotence And Recovery

No database changes. Verification uses isolated checkouts and disposable test
databases. Do not change the user's bookmark draft.

## Artifacts And Notes

Verification logs: `/tmp/manage-responsive-navigation-browser.log` (final
subsections and navigation recovery) and `/tmp/manage-navigation-verify.log`
(canonical gate snapshot before the loading refinement). Final browser builds
compile/typecheck the updated web source. Final loading regression: `/tmp/native-navigation-browser-final.log`;
canonical gate: `/tmp/native-navigation-verify.log`. Inspected interruption recovery
at `/tmp/w3-navigation-recovery.png`; no spinner or routine loading message remains.

Visual review applies Refactoring UI hierarchy and layout/spacing: quiet product
register, fixed sidebar width, current-leaf emphasis. Three issues addressed:
misaligned global/content edges, double active parent/child emphasis, and short
status labels wrapping mid-word beside long collection titles. Final screenshots
were inspected. Final score: 8/10; hierarchy, responsive controls and current
destination are clear. Artifacts include `/tmp/manage-admin-context.png`,
`/tmp/import-review-true-light-390.png`, `/tmp/manage-menu-true-light-768.png`,
`/tmp/import-review-true-dark-1280.png` and `/tmp/import-review-true-dark-1440.png`.

## Interfaces And Dependencies

No new dependencies. Existing session capability flags, import list API and
native forms remain authoritative. Legacy Drafts query links redirect to Review.
