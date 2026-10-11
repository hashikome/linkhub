# Bound import shifts and classify transfer conflicts

## Purpose / Big Picture

A repair batch spanning many sections must finish within the authority transaction
without repeatedly moving thousands of saved resources. A transfer slug conflict
must use ordinary error handling rather than requesting an unchanged impact preview.

## Progress

- [x] (2026-10-11) Inspected insertion ordering, unique positions and lifecycle replay.
- [x] (2026-10-11) Consolidated destination plans and two bulk shifts; flat rows precede new headings.
- [x] (2026-10-11) Direct and resumed impact refreshes require version_conflict.
- [x] (2026-10-11) Import scale/rollback suite and direct/resumed browser conflicts passed.
- [x] (2026-10-11) Full isolated verification passed, including all 31 import tests and shared-destination flat/section regression.

## Surprises & Discoveries

The existing shift loop is once per folder, not per destination; 100 sections
before 4,900 saved links cause nearly half a million serial writes. Position
uniqueness is immediate, so bulk movement requires collision-free temporary slots.

## Decision Log

- Retain placement rules but merge insertion slots for each destination against
  one snapshot. Apply two parameterized bulk position updates and increment
  resource versions once. Existing authority transactions retain rollback.
- Only version_conflict invalidates an impact preview. Other 409 codes retain
  normal error handling, including resumed actions.

## Outcomes & Retrospective

Both fixes are complete. Collection batches use two tenant-scoped bulk position
writes and retain atomic rollback, source ordering and idempotent receipts. Only
version conflicts refresh lifecycle previews. Full verification and focused
browser regressions passed. Changes remain uncommitted.

## Context And Orientation

`apps/api/src/modules/imports/imports.service.ts` commits 100 ready rows, grouped
by source folder. `apps/web/src/lib/collection-operation.ts` submits lifecycle
forms; `complete-sign-in.ts` replays interrupted ones. Both currently classify
all 409 responses as stale impact.

## Plan Of Work

Group ready folders by destination, preserve source-order slot planning, bulk move
existing resources safely, then insert sections/resources and receipts. Add a
5,000-link repair fixture and reuse ordering/rollback tests. Cover actual transfer
slug conflicts and stale impacts through native and enhanced browser forms.

## Concrete Steps

Run focused imports e2e through a disposable database; run isolated browser
lifecycle tests and `bun run verify:isolated` sequentially to respect disk quotas.

## Validation And Acceptance

The 100-section repair completes within the unchanged 30-second transaction;
existing positions shift once logically, versions increment once, no duplicates
or empty sections appear, and replay is harmless. Slug conflicts do not display
impact-changed; genuine stale confirmations still do.

## Idempotence And Recovery

No migrations or development-data mutations. Tests own disposable databases.
All batch writes and receipts remain one authority transaction.

## Artifacts And Notes

Import suite: `/tmp/import-batch-fix2.log`, 30 tests / 183 assertions; scale fixture
including forced rollback and retry completed in 7.5 seconds. Browser stale-impact
case passed in `/tmp/import-transfer-browser2.log`; direct/resumed slug-conflict
case passed with/without JavaScript in `/tmp/import-transfer-browser3.log`.
Two browser retries corrected fixture return routing and an ambiguous alert locator.

## Interfaces And Dependencies

No new dependency or API shape. Preserve tenant-scoped queries and immediate
unique collection/position constraints. Record behavior in reliability docs.

Full gate evidence: `/tmp/import-transfer-verify.log`, exit 0; scale regression
with rollback/retry completed in 8.1 seconds in that run.
