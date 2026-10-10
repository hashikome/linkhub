# Add section context and collapse controls

## Purpose / Big Picture

Sections have optional 500-character plain-text descriptions shown with their
headings, without a Details link. Readers can collapse individual item groups or
expand/collapse all, while descriptions remain visible. Owners and contributors
can add sections around existing items and edit section descriptions. Every
section contains at least one web link or linked collection, enforced in the API.

## Progress

- [x] (2026-10-09) Confirmed descriptions are 500 characters and the minimum means
  any item, not specifically a collection reference. Inspected flat ordered rows.
- [x] (2026-10-09) Implemented persistence, contracts, atomic section creation and minimum rules; targeted API cases passed.
- [x] (2026-10-09) Implemented authoring and native/enhanced reading, including pagination context and inline item details.
- [x] (2026-10-09) Recorded ADR-0027 and updated product/focused docs. Empty migration chain and populated upgrade preserve existing rows and SQL-only objects; no Prisma drift.
- [x] (2026-10-10) Full `bun run verify` passed; all 64 production browser tests passed (1,101 assertions). Inspected desktop/light and mobile/dark screenshots; applied reviewed local migrations without a reset.

## Surprises & Discoveries

Sections are heading resources; membership is positional until the next heading.
Current APIs permit empty headings; there is no section authoring web surface.
Resource pagination can begin inside a section and must carry backend-resolved
heading context. Description is currently resolved metadata for links only.

## Decision Log

- User: optional plain-text descriptions, maximum 500 characters; at least one
  web link or collection reference per section; no heading Details action.
- Follow-up user direction: links and references also expand details inline, replacing the modal. Preserve durable item URLs and authorization.
- Descriptions stay visible when items collapse. Individual native disclosures
  work without JavaScript; enhanced Expand all/Collapse all reset their state.
- Preserve the ordered-resource model. Create a section before an existing item
  identified by immutable ID and expected version, shifting positions atomically.
  Reject mutations producing empty sections. Deleting a heading keeps its items.
- Section descriptions are authored context, distinct from fetched link metadata.
  Amend ADR-0007 explicitly to permit their edits with optimistic version checks.

## Outcomes & Retrospective

Implemented and verified. Sections carry optional bounded context and retain at
least one item; owners/contributors can author them. Native inline details replace
item dialogs, with enhanced global controls and durable deep links. Existing
uncommitted work and development content were preserved.

## Context And Orientation

ResourcesService handles heading creation, positional mutations and reads.
Resource schema/shared contracts carry item data. PaginatedList and ResourceRow
render the collection body; CollectionReader delivers initial rows. Section
forms will use backend capabilities and existing account-bound continuation.

## Plan Of Work

Add a heading-only description column and reviewed additive migration. Change
heading creation to start before an existing non-heading item using its version.
Validate section membership on create/delete/reorder/position edits. Return the
preceding section in cursor metadata for partial pages. Add section description
editing and creation forms, and grouped disclosures in collection reading.

## Concrete Steps

Generate migration with Prisma migrate dev --create-only against a disposable
copy, inspect SQL-only constraints/triggers, and verify empty/populated chains.
Run bun run verify and focused production browser tests. Inspect mobile/desktop,
light/dark, native/JS, pagination, error and permission cases.

## Validation And Acceptance

Descriptions roundtrip, clear and reject overlength/non-heading writes. Readers
cannot edit; contributors can. Empty section creation and removing/reordering the
last item fail atomically. Pagination retains section context without duplicates.
Collapse toggles hide items, retain descriptions and support keyboard use;
Expand all/Collapse all also govern subsequently loaded sections. Existing links,
references and their details remain authorized by backend policy.

## Idempotence And Recovery

Preserve uncommitted work and development data. No resets, commits or pushes.
Test and migration inspection use disposable databases. Do not remove legacy data.

## Artifacts And Notes

- `/tmp/sections-migration.log`: populated upgrade, constraints, SQL objects and schema parity passed; empty chain passed in API/browser fixtures.
- `/tmp/sections-api-tests.log`: new section cases and all earlier API files passed; final wire-contract assertions needed `section` registered as optional. Fixed and rerunning the full gate.
- `/tmp/sections-browser.log`: inline item journeys passed with and without JavaScript. Section authoring native path passed; enhanced retry required correcting an ambiguous alert locator and the existing More resources link selector. Final retry pending.
- Inspected desktop light and mobile dark screenshots. Removed old stretched resource links to allow mouse toggles; section/link indicators now share plus/minus styling.
- Reviewed local pending migrations: collaborator-role rename and section-description column. Both applied successfully, preserving grants and content; no reset.

## Interfaces And Dependencies

No dependencies. Backend owns descriptions, limits, membership and capabilities;
clients render server data and submit typed operations using immutable IDs.

Final evidence:

- `/tmp/sections-verify.log`: complete repository gate passed, including wire
  contracts, section rules, exports, unit/e2e, build and web typechecking.
- `/tmp/sections-browser-final.log`: 64 passed, 0 failed, 1,101 assertions.
  Mouse/keyboard toggles, repeated global resets, pagination, native forms and
  stale first-item retry all pass.
- `/tmp/sections-dev-deploy.log`: reviewed collaborator-role and section-description
  migrations applied to the local development database without reset.
- `/tmp/sections-true-390.png` and `/tmp/item-details-true-1280.png`: inspected
  final inline reading and authoring results. No mobile overflow.
