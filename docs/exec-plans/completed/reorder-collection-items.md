# Reorder collection items and simplify disclosures

## Purpose / Big Picture

Readers see Expand and Collapse controls and can collapse an expanded item by
clicking its non-interactive content. Owners and contributors can open Reorder,
drag items or use native Move up/Move down controls. Moves save immediately. Follow-up: only one item stays expanded, the URL tracks
its ID, and direct item links scroll into view. Add sample descriptions to the
four sections of local collection 01a1168a-ab66-7973-91e2-6ad20e1c2e45.

## Progress

- [x] (2026-10-10) Inspected reading, ordering, section rules and sign-in continuation.
- [x] (2026-10-10) Implement atomic relative moves, version advancement and regression tests.
- [x] (2026-10-10) Implement reorder page, drag/native controls and body-click collapse.
- [x] (2026-10-10) Added the requested four local section descriptions through the
  backend service with DTO validation, versions and audit in one transaction.
- [x] (2026-10-10) Full repository verification passed; final production browser
  checks passed (7 tests, 90 assertions), including selection across pagination,
  late-item scrolling, header folding, drag/native movement and sign-in continuation.
  Formatting, lint, document links and diff whitespace checks pass. Inspected the
  actual local collection on desktop/mobile after adding its descriptions.

## Surprises & Discoveries

The full-order API does not increment versions and its temporary offset can
collide with sparse existing positions. Full-order payloads also outgrow the
account-bound pending-action cookie. Relative move commands avoid that problem
and allow paginated native forms without trusting a partial client snapshot.

The browser checks also exposed same-route redirects retaining old reorder props;
server actions now revalidate the route after saving. Visual inspection of the
actual collection found header folding reset programmatic item scrolling; the
fold now preserves an already requested scroll destination.

## Decision Log

- 2026-10-10: Keep ordering authoritative in ResourcesService. Add a small relative
  move command using source version and, for drag destinations, target version.
  Reuse the full-order mutation after resolving the current collection order.
- 2026-10-10: Moving a section moves its contained items. Individual items can move
  between sections; the API rejects empty sections. Reorder is a focused page,
  paginated like the reader, with immediate saves and native keyboard/touch buttons.
- 2026-10-10: Follow-up user direction narrows expansion to one item, synchronized
  with the URL. ADR-0030 explicitly supersedes ADR-0027's global item expansion.
- 2026-10-10: Item body clicks collapse only that item's disclosure. Preserve
  anchors, text selection and native summary keyboard behavior.

## Outcomes & Retrospective

Completed. Reader controls are Expand and Collapse; owner/contributor Reorder
supports dragging and native buttons with immediate backend-validated saves.
Only one item is selected, its URL stays current through pagination, and direct
item links scroll without the header resetting their destination. The requested
local collection has four section descriptions. Existing work remains uncommitted
and preserved; no migration or database reset was needed.

## Context And Orientation

ResourcesService owns positional sections and content-write permissions. The
collection reader uses ResourceSections and ResourceRow. Section authoring uses
server actions and encrypted account-bound continuation. Reordering uses these
same HTTP boundaries, never Prisma from the web.

## Plan Of Work

Fix full-order temporary positions and versions, add relative movement DTO and
shared contract, then expose it with a server action and focused reorder page.
Add drag enhancement to native forms and shorten reader controls. Introduce a
small client disclosure wrapper, preserving native details. Update focused docs
and CHANGELOG after backend and browser checks.

## Concrete Steps

Run `bun run verify`, then `bun run test:browser --test-name-pattern 'item details routes|section authoring|reorder'`.
Do not overlap Next builds. Listener/database tests may require sandbox escalation.

## Validation And Acceptance

Owner/contributor movement succeeds; viewer/cross-collection/stale moves fail.
Section blocks move together and empty sections roll back. Sparse positions
reorder safely and stale full snapshots cannot overwrite a subsequent reorder.
Browser checks cover native and enhanced moves, dragging, continuation, shortened
controls, non-interactive body clicks, links, and text selection.

## Idempotence And Recovery

No migrations, resets or commits. Existing uncommitted work stays intact.
Versions prevent replaying moves against changed items. Failed moves preserve the
current order; sign-in continuation keeps the compact account-bound command.

## Artifacts And Notes

- Full `bun run verify`: `/tmp/reorder-final-verify.log` (passed).
- Final production build and browser checks after the scrolling/selection changes:
  `/tmp/reorder-selection-pagination.log` (7 passed, 90 assertions).
- Final formatting/lint: `/tmp/reorder-final-format.log`, `/tmp/reorder-final-lint.log`.
- Local collection preview: `/tmp/backend-sections-1280.png`,
  `/tmp/backend-sections-390.png`; four descriptions, URL selection and viewport
  assertions passed. Reorder desktop/mobile captures: `/tmp/reorder-true-1280.png`
  and `/tmp/reorder-true-390.png`.
- Earlier failed drag runs led to scroll-margin and route-refresh fixes; they are
  retained as diagnostic logs, not represented as successful verification.


## Interfaces And Dependencies

Shared request types in packages/types; Nest DTO validation and policy in apps/api;
Next server actions call HTTP only. Native forms remain usable without JavaScript.
