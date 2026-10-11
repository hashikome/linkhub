# Make import actions apply to selected links

## Purpose / Big Picture

Review thousands of staged links without accidentally importing, retrying or
removing unselected rows. Selection reveals counted actions in a single footer;
Refresh stays first and available; counted selection actions follow it. Inline edits say Save, lookup status says Processing,
and management navigation says Import.

## Progress

- [x] (2026-10-11) Implemented selection-only import, removal, retry and unfiled collection assignment, native form fallback, and list-level discard.
- [x] (2026-10-11) Added counted action labels and colocated Refresh button; removed repetitive folder/unfiled instructions above the table.
- [x] (2026-10-11) Focused API: 24 passed, 114 assertions. Browser workflows: 6 passed, 137 assertions; final layout/count/discard checks: 2 passed, 64 assertions.
- [x] (2026-10-11) Inspected populated, selected, empty and error screenshots at 390, 768, 1280 and 1440 pixels in both themes.
- [x] (2026-10-11) Canonical isolated verification passed (`/tmp/import-tabs-verify.log`).
- [x] (2026-10-11) Added user-requested New import / Drafts navigation, a distinct Upload file button with filename, compact hints, and Support import guide.
- [x] (2026-10-11) Tab navigation, file chooser/validation and native fallback passed; corrected test alert scoping to exclude Next’s route announcer.
- [x] (2026-10-11) Final upload/native workflow passed (1 test, 32 assertions); bounded review and Refresh-first checks passed. Follow-up navigation changes tracked in manage-sidebar-and-review.md.

## Surprises & Discoveries

Whole-draft commit used to drop all duplicate rows. Selected import must avoid
that cleanup so it cannot mutate unselected rows. Collection assignment must
resolve its destination once per selection to avoid creating duplicate groups.

## Decision Log

- 2026-10-11: User requested actions only on selection and affected counts. Require every selected row to qualify for an action; show only applicable actions. Keep the existing 50-row selection cap and owner/version checks.
- 2026-10-11: Refresh is a native GET button in the same footer; discard is confirmed on the imports list. No schema changes or additional export implementation.
- 2026-10-11: Follow-up approved New import and Drafts tabs; opening a draft adds a closable Review tab (updated user direction). Move the preparation guide to Support and use Upload file with an adjacent filename, preserving native file inputs without JavaScript.

- 2026-10-11: User preferred the stacked screenshot after trying the side-by-side proposal. Keep full-width format selector, upload/filename row, hint, then Review file.

- 2026-10-11: Opening a draft now adds a contextual Review tab; closing returns to Drafts without changing saved draft state. This supersedes keeping Drafts active on review pages.

## Outcomes & Retrospective

Implementation and verification complete. Existing API-wide operations
remain available; obsolete web adapters are removed.

## Context And Orientation

`apps/web/src/components/import-review.tsx` owns inline forms, selected IDs,
continuation and the action footer. `apps/web/src/lib/import-forms.ts` forwards
native/enhanced submissions and preserves account-bound commands through sign-in.
`apps/api/src/modules/imports/imports.service.ts` validates selection and mutates
rows under the controller's existing authority transaction. Shared DTO contracts
live in `packages/types/src/imports.ts`.

## Plan Of Work

Extend selected operations to import and place, preserve untouched rows, then
replace global controls with counted selection controls. Keep native forms and
existing tab/continuation behavior. Update product/design decisions and verify.

## Concrete Steps

From repository root run `bun run check`, focused imports API/browser tests using
the existing isolated database/checkout workflow, then `bun run verify:isolated`.
The latter runs the canonical `bun run verify` without disturbing the development
server. See `docs/runbooks/verification.md`.

## Validation And Acceptance

No selection: only Refresh, per-row Edit and navigation. Selection: counted
applicable actions and Clear selection. Selected import does not drop unrelated
duplicates; selected placement leaves other unfiled links unchanged. Native forms,
inline errors, filtered sign-in replay, Load more, and 390/768/1280/1440 widths
remain usable. Both themes use existing design tokens.

## Idempotence And Recovery

No migrations. Mutation version checks reject stale forms atomically. Tests use
isolated disposable databases; do not change the user's bookmark draft.

## Artifacts And Notes

Focused evidence: `/tmp/selected-actions-api.log`,
`/tmp/selected-actions-browser.log`, `/tmp/selected-actions-browser-final.log`.
Screenshots: `/tmp/import-review-selection.png`,
`/tmp/import-review-true-light-390.png`, `/tmp/import-review-true-light-768.png`,
`/tmp/import-review-true-dark-1280.png`, `/tmp/import-inline-error.png` and
`/tmp/import-review-empty-true.png`. Artifacts are disposable; assertions and
behavioral coverage are retained in the repository tests.

Refactoring UI hierarchy/spacing and taste-layer review: quiet register,
8/10 overall. Fixed three observed issues: excess copy above the table, the
Refresh button inheriting a top margin, and summary controls losing their
horizontal button padding. Re-rendered and inspected the result. Long collection
names wrap, the table remains bounded, and narrow screens preserve all controls.

## Interfaces And Dependencies

Selection request: version, up to 50 unique row IDs, action import/revalidate/remove/place;
place requires collectionTitle. API returns updated draft and selected row views.
No new dependency; existing React/Next native forms and Nest/Prisma transaction.
