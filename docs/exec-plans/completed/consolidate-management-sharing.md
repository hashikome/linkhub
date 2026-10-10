# Consolidate the implemented management and sharing flows

## Purpose / Big Picture

Remove superseded preproduction paths so Manage and contextual sharing use their
settled contracts directly. Preserve authorization, progressive enhancement,
audit evidence, event idempotency and all current user-visible capabilities.

## Progress

- [x] (2026-10-09) Inventoried the dirty working tree and current design records.
- [x] (2026-10-09) Removed obsolete dispatch, compatibility endpoints and unused UI/types.
- [x] (2026-10-09) Removed four migration generators, a one-off test runner, obsolete fixture SQL generator and two abandoned share-placement mockups.
- [x] (2026-10-09) Assessed migration consolidation; deferred squash to the planned DB reset. Fresh chain parity passes; SQL-only objects preserved.
- [x] (2026-10-09) Updated current docs, ADR amendments and CHANGELOG; `bun run verify` passes in the isolated checkout.
- [x] (2026-10-09) Completed production browser journeys with and without JavaScript: 54 passed initially; corrected one order-sensitive URL assertion and the remaining journey passed on focused retry.

## Surprises & Discoveries

The repository has extensive uncommitted feature work. Cleanup applies on top of
that work; no reset, checkout or broad deletion is appropriate. Scoped audit API
views and collection redirect actions survived the unified screens. The ref
folder contains one-off migration and verification scripts.

The new direct Share-link assertion initially assumed a query-parameter order.
The link was correct; the assertion now checks the parsed path and exact parameter
values. No production behavior change was needed after the full verification gate.

## Decision Log

- Remove only paths with traced replacement consumers; keep security checks and
  native HTML fallbacks. Date: 2026-10-09.
- Migration consolidation must prove fresh schema parity and preserve triggers,
  constraints, indexes and functions. Do not wipe the development database.
  Date: 2026-10-09.
- Retain migrations until the planned preproduction wipe: the documented squash
  requires resetting/rebaselining existing development databases. No migration
  changes were necessary for runtime cleanup. Date: 2026-10-09.

## Outcomes & Retrospective

Removed scoped audit endpoints/projections, the held-only collection listing and
link resolver, redirect-only collection action dispatch, legacy tracking aliases,
unused account/disclosure/toast UI, unused social templates and disposable scripts.
Collection actions use direct destinations and recheck access at their endpoints.
Audit pagination retains database timestamp precision without constructing a
redundant intermediate cursor. Sharing builds each created response once.

`bun run verify` passed. The full browser run passed 54 journeys, and the remaining
action-dialog journey passed after correcting its URL-order assertion (36 focused
assertions, including native fallback). Fresh migration replay matches Prisma and
preserves SQL-only objects. No development database reset, migration rewrite,
commit or publication was performed. Migration squash remains for the already
planned preproduction reset.

## Context And Orientation

The web app uses `/manage` and `/share`. Collections expose permitted actions,
accounts navigate to detail, and `AuditLog` is the sole audit store. ShareEntry
stores intent plus a maintained count; ShareOpen stores idempotent event evidence.
Code lives in apps/web/src, apps/api/src and packages/types. Focused authority is
in docs/design-docs/manage-workspace.md and sharing.md and ADRs 0023–0025.

## Plan Of Work

Trace old routes and symbols against actual consumers, replace redirect-only
navigation with direct destinations, remove orphaned code and compatibility
contracts, and move tests to final endpoints. Inspect temporary scripts before
removal. Consolidate migration history only with a repeatable scratch-database
proof; record any development-history implications. Update current docs and an
ADR amendment for removed compatibility. Verify in an isolated copy so a running
development server's build artifacts are not touched.

## Concrete Steps

Use rg and TypeScript reference inspection; run bun run verify in an isolated
snapshot and bun run test:browser against disposable databases. For migrations,
apply existing history to a disposable database, compare Prisma schema and inspect
SQL-only objects. If squashing, additionally dump with pg_dump and compare the
replayed baseline before rebaselining development databases.

## Validation And Acceptance

Final navigation has no obsolete share/view/edit dispatch hop. One audit timeline
API remains with existing category-based authority. Canonical tracking uses via.
All required tests pass from a fresh database, including browser/no-JS journeys.
No development records are deleted and no work is committed or published.

## Idempotence And Recovery

Verification runs in a temporary isolated source snapshot; migration history remains intact. Test databases are created and removed by tooling/test-database.ts. Preserve
existing development data; if migration bookkeeping cannot be reconciled safely,
leave the squash for the planned preproduction reset and document why.

## Artifacts And Notes

Verification logs: `/tmp/cleanup-verify-final.log`, `/tmp/cleanup-schema.log`,
`/tmp/cleanup-browser.log`, `/tmp/cleanup-browser-retry.log`.
Scratch source: `/tmp/nslinkhub-cleanup-RwtlL9`. Fresh-schema diff reports no
difference; preserved 2 required functions, 9 triggers, 44 checks and 3 partial indexes.

## Interfaces And Dependencies

Bun, Prisma/PostgreSQL, Next.js, native dialogs/forms, shared API contracts.
Service roles never grant foreign private-content access. Preserve UUID identity,
atomic event counters, server-side validation and authentication boundaries.
