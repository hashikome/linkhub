# Deliver collaborators and item routes

This ExecPlan is maintained according to `PLANS.md`.

## Purpose / Big Picture

Collection collaborators use viewer and contributor consistently in persistence,
API contracts and web forms. Anyone who can read a collection can open an item
at `?item=<id>` on its permanent or pretty address, with or without JavaScript.
The backend authorizes the collection, scopes the item to it and filters reference
targets independently. This delivers PRODUCT.md §11 milestone 4.

## Progress

- [x] (2026-10-09 11:04Z) Read the handoff, product, architecture, designs and decisions;
  inspected the dirty tree and saved a read-only baseline under `/tmp`.
- [x] (2026-10-09 11:10Z) Rename roles and migrate existing grants and bounded audit evidence.
- [x] (2026-10-09 11:23Z) Deliver authorized single-item reads and native/enhanced details routes.
- [x] (2026-10-09 11:32Z) Verify API, populated migration and full browser behavior;
  update canonical docs/changelog and complete the plan.

## Surprises & Discoveries

- Existing Manage/Share forms already label roles Viewer/Contributor but send
  reader/editor. Roles are varchar columns with SQL-only CHECK constraints;
  audit state strings also embed the old identifiers.
- Resource reads are paginated and have no single-item endpoint. Selecting an
  item from the first page in the client would miss later items and misplace
  backend responsibility.
- Existing work is extensively uncommitted. Bulk-import and internals active
  plans are separate work and remain untouched.
- Browser checks that selected a resource by partial link text or every anchor
  in a row also matched its new Details link. Update those assertions to select
  the exact destination link; keep both accessible link names descriptive.

## Decision Log

- Decision: Apply the accepted rename in ADR-0013/0017 outright, with no old-role
  aliases. Preserve data with an additive, reviewed SQL migration.
  Rationale: ADR-0006 and the user require current contracts and preservation of
  existing work; no development reset or migration squash is necessary.
  Date: 2026-10-09.
- Decision: Add `GET /collections/:id/resources/:resourceId`, reusing resource
  serialization and collection policy. Render existing metadata and attribution
  in an accessible details overlay with a native close link.
  Rationale: Works beyond pagination and on both collection addresses without
  implementing the later preview-card, notes or item-editing milestones.
  Date: 2026-10-09.

## Outcomes & Retrospective

Delivered the accepted role rename and item routes. The backend owns grant
validation, transfer eligibility, item ownership and destination authorization.
Both native and enhanced web journeys pass, including pagination, Close/Back,
Escape, revoked links and sign-in return paths. The final full verification and
production browser gates are green. Existing dirty work and development data
remain intact; the migration was verified on disposable databases only. No commit
or push was prepared. Preview cards, notes, item editing, bulk import and the
internals plan remain separate work.

## Context And Orientation

`apps/api/src/modules/hubs/collection-policy.service.ts` owns authorization.
Collections services own grants, transfers and lists; comments derive contributor
badges. `packages/types` owns wire contracts. `apps/api/prisma/migrations` owns
SQL checks and data migrations. `ResourcesService` filters reference destinations.
Both web collection routes render `CollectionReader`; `PaginatedList` renders
`ResourceRow`. Existing capability booleans remain authoritative.

## Plan Of Work

Rename role literals, error codes, audit state identifiers and affected tests.
Migrate SQL-only constraints and existing rows, then amend the implementation
status of the accepted role decision. Add the single-resource read with policy
checks and regressions. Connect details links to a server-loaded details surface,
preserving the collection address, token and pagination on close. Check unknown,
foreign and unavailable items without revealing private destinations. Update
current designs/product status and CHANGELOG, then run the complete gates.

## Concrete Steps

From the root: `bun run infra:up`, `bun run check`, `bun run verify`,
`bun run test:browser`. From `apps/api`, use `bunx prisma migrate dev
--create-only` on an owned scratch database and review its SQL; apply the full
chain and run `bunx prisma migrate diff --from-config-datasource --to-schema
prisma/schema.prisma`. Never reset the development database.

## Validation And Acceptance

- Viewer reads but cannot write; contributor edits content/moderates but cannot
  manage sharing, publish, delete or access another collection. Transfer requires
  a contributor and leaves the previous owner a contributor.
- Old role inputs fail validation. Existing grants and audit effect strings
  migrate to current identifiers; SQL-only objects survive and Prisma has no drift.
- Single-item reads work beyond page one; unknown/foreign IDs and inaccessible
  collections disclose no item. Reference targets remain independently authorized.
- Both URL forms show item details with native links, preserve `s` and cursor,
  support keyboard closing/Back, and render narrow/light/dark layouts.
- `bun run verify` and production browser journeys pass.

## Idempotence And Recovery

Verification uses disposable databases and is repeatable. Migration deploy is
tracked by Prisma; the data migration runs once. Preserve all pre-existing dirty
files and applied migrations. Recover a failed scratch run by removing only its
owned database. No commit or push before milestone review.

## Artifacts And Notes

- `/tmp/collaborator-schema.log`: populated upgrade preserves all four old
  grant/source combinations and their audit effects; rejects old roles afterwards;
  functions, triggers, other constraints and indexes unchanged. Prisma reports
  `No difference detected`. Scratch database removed by the test lifecycle helper.
- `/tmp/collaborator-verify-final.log`: final complete `bun run verify` passed
  (exit 0), including updated transfer assertions, API tests, source checks, web
  tests and production compilation. The earlier `/tmp/collaborator-verify.log`
  also passed before final browser refinements.
- `/tmp/collaborator-browser-final.log`: final full production browser suite
  passed, 57 tests and 970 assertions. The earlier full run had 51 passes and
  six test failures (ambiguous selectors and shared fixture state); it was not
  a green run. Isolated retries corrected metadata fixture and history/hydration
  waits before the fully green rerun.
- `/tmp/collaborator-browser-focused.log`: both native/enhanced item journeys pass
  (2 tests, 36 assertions). Inspected desktop light and phone dark screenshots
  under `/tmp/item-details-*.png`. Native Back waits for navigation commit because
  restored no-JavaScript documents need not emit a new load event.
- New API regressions pass for role validation, content/management boundaries,
  pagination, foreign IDs, private references, link rotation and holds.

The initial file baseline is `/tmp/collaborators-baseline`; it is disposable
review assistance, not a source of product decisions.

## Interfaces And Dependencies

NestJS/Prisma stay backend-private. Shared `ShareRole` becomes
`"viewer" | "contributor"`; comment roles become owner/contributor/null.
The resource response reuses `Resource`. Next.js consumes the API through
`serverRead`; no client infers access from roles or IDs. No new dependencies.
