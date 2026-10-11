# Make import review a bounded, editable management table

This ExecPlan follows `PLANS.md`.

## Purpose / Big Picture

Review large bookmark, CSV and text imports without leaving a bounded links table.
Automatic bookmark placement uses meaningful folder names, flat sections and
same-owner collection references. Checkboxes precede Link, Tags, Section,
Collection, Status and Edit. Inline edits and targeted actions preserve progress.

## Progress

- [x] (2026-10-11) Implement automatic bookmark mapping, wrapper removal, recursive
  single-reference collapse, legacy draft migrations and tab-aware actions.
- [x] (2026-10-11) Verify the preceding mapping milestone: six focused browser
  journeys and full isolated repository gate passed before inline selection changes.
- [x] (2026-10-11) Implement inline edits and selected retry/removal, replacing
  standalone editors and the Revalidate column. Preserve native form fallbacks.
- [x] (2026-10-11) Selected-action API: 22 tests pass. Six native/enhanced
  browser journeys pass, including inline edits after Load more, selected actions,
  injected save/load errors, responsive layouts and expired-session replay.
- [x] (2026-10-11) Full isolated repository gate passed, including production
  build, API/web tests, typechecks, tooling, boundaries and documentation.
- [x] (2026-10-11) Filtered sign-in return browser check passes with and without
  JavaScript, preserving both inline edits and the Needs attention tab.
- [x] (2026-10-11) Record final evidence and move this plan to completed.

## Surprises & Discoveries

Browser exports wrap meaningful folders in browser-owned containers. Ignore those
only at the export boundary. Failed and pending source links count when deciding
whether a parent collection is redundant; lookup timing cannot change structure.
Native pending commands use a bounded encrypted cookie, so selection is capped at
50 IDs. JavaScript-enhanced mutations use the existing same-origin native forms,
retaining owner-bound sign-in replay and origin checks.

## Decision Log

- 2026-10-11: Meaningful roots and branching folders become named private
  collections. Leaf child folders become flat sections. Collapse intermediaries
  with one collection reference and no other source content. Keep already-created
  destinations and manual edits. Supersedes earlier single/split controls.
- 2026-10-11: Unfiled links require an explicit collection name; never invent an
  Imported links collection. CSV remains prescribed creation-only placement.
- 2026-10-11: All shows applicable draft actions; Ready import; Needs attention
  retry/drop failed; discard only All. Native forms preserve the active filter.
- 2026-10-11: User supersedes standalone editing with row inputs and selected
  actions. Select first, Edit last, Tags visible; no Revalidate column. Native
  checkboxes provide keyboard access; non-interactive row clicks are a shortcut.
- Refactoring UI hierarchy/finishing and taste interaction states: quiet register,
  one primary import action, compact selection bar outside the scroll region,
  destructive emphasis only at confirmation, visible labels and theme tokens.

## Outcomes & Retrospective

Implementation, focused browser/API checks and full isolated verification are
complete. Inline editing, selection, targeted actions and sign-in replay meet
the final product direction.
Earlier mapping verification passed: `/tmp/bookmark-browser-accepted.log` (6
browser tests) and `/tmp/bookmark-verify-accepted.log` (full gate). Migration
backfill and schema parity passed. Current bookmark fixture maps 1,115 links to
5 named collections, 14 sections and 8 unfiled links requiring a name.

## Context And Orientation

`apps/api/src/modules/imports/import-parser.ts` maps source folders. The service
owns placement, authorization, selected actions and transactional commits.
`apps/web/src/components/import-review.tsx` provides table interaction;
`apps/web/src/lib/import-forms.ts` owns native/enhanced mutation and pending replay.
The review route supplies counts and cursor pages. Legacy editor URLs redirect.

## Plan Of Work

Keep 25 initial rows and Load more. Pause polling during selection, edits and
extended browsing. Save inputs without resetting appended rows, then refresh
counts. Selected actions validate every ID and revision before mutation. Keep
CSV placement read-only. Remove obsolete UI/routes and update docs and changelog.

## Concrete Steps

Run `bun run check`, focused disposable-database import tests, then
`bun run verify:isolated test:browser -t 'reviews bookmark imports|bounds import review|creates CSV collections|resumes submitted import|requires explicit hub creation before uploading|saves collection URLs'`.
Run `bun run verify:isolated` serially after those pass. Isolated builds protect
the running development checkout and its Next.js build artifacts.

## Validation And Acceptance

Verify first-column checkboxes, row-click selection, Clear selection, header
selection, targeted retry and confirmed removal. Edit and save a row from an
appended page without losing loaded rows. Check native fallbacks and expired
session replay. Capture and inspect 390, 768, 1280 and 1440px screenshots, light
and dark, populated/empty/loading/error/focus/edit/selection states. No horizontal
page overflow. Desktop table stays within the viewport.

## Idempotence And Recovery

Every mutation checks draft ownership and version; stale retries conflict.
Selection validates all rows before changing any. Saved import receipts prevent
reimport and reference resurrection. Additive migration and data backfill preserve
saved resources and manually corrected groups. Do not edit applied migrations.

## Artifacts And Notes

Earlier parser: `/tmp/bookmark-parser.log`; mapping/backfill:
`/tmp/bookmark-backfill.log`; schema parity:
`/tmp/bookmark-schema-parity-final.log`. Current API/browser evidence will be
recorded after latest verification completes.

## Interfaces And Dependencies

`ImportSelectionRequest` carries version, rowIds (1–50 unique UUIDs), action.
The response carries the updated draft and selected row views. Existing row PATCH
and single-row GET support inline edits. No new runtime dependency or schema
change is needed for selection. Client code consumes wire types only.

### Inline review evidence

`/tmp/inline-api.log`: 22 passed, 103 assertions. `/tmp/inline-http-final.log`:
16 passed, 110 assertions. `/tmp/inline-browser-verified.log`: six passed,
148 assertions, both JavaScript modes. The first browser runs caught a sticky
header obscuring Save on a short viewport; scroll padding and a minimum editing
region fixed it. Assertions now wait for completion rather than mistaking a
Saving label for a finished mutation.

Visual review inspected `/tmp/import-review-true-light-390.png`,
`/tmp/import-review-true-light-768.png`, `/tmp/import-review-true-dark-1280.png`,
`/tmp/import-review-true-dark-1440.png`, `/tmp/import-editor-true-390.png`,
`/tmp/import-editor-true-1440.png`, `/tmp/import-review-selection.png`,
`/tmp/import-inline-error.png`, `/tmp/import-review-loading.png`,
`/tmp/import-review-load-error.png` and `/tmp/import-review-empty-true.png`.

Refactoring UI taste review: 32/40. Nielsen scores (0–4): status 3, real-world
match 4, control 3, consistency 4, prevention 3, recognition 3, efficiency 4,
minimalism 3, recovery 3, help 2. Strengths: link-first scan order, selected actions
outside the scrolling table, corrections without losing loaded rows. Three
prioritized problems fixed: header/checkbox misalignment (low), broken words in
tablet collection cells (medium), and sticky-header overlap during inline editing
(high). Native checkboxes preserve keyboard access and entire non-interactive row
surfaces provide selection targets. Small screens deliberately stack cells and
allow document scrolling; narrow collection/tag inputs scroll their text instead
of widening the page. CSV placement stays read-only by design.

Final full gate: `/tmp/inline-verify-final.log` passed on the current implementation.

Final filtered return check: `/tmp/inline-filter-return.log` passed (one scenario,
14 assertions, JavaScript enabled and disabled). No verification blockers remain.
