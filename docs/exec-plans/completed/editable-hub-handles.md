# Editable hub handles

> Historical milestone. Same-owner handle reuse and unlimited rename cadence in this milestone were superseded by [ADR-0043](../../engineering-decisions/0043-deliberate-hub-handle-changes.md).

## Purpose / Big Picture

A hub's purpose can change over time. Its owner can change its handle and name;
the immutable hub UUID keeps saved/shared links stable. Remove the permanent
claim mechanism rather than leaving an unreachable mode behind.

## Progress

- [x] (2026-10-10) Inspect API, trigger, settings, tests and ADR-0033.
- [x] (2026-10-10) Removed claim fields, errors, UI and permanence trigger; generated/reviewed the migration.
- [x] (2026-10-10) API tests passed (9 tests, 80 assertions); upgrade/parity checks and repeated browser renames passed with/without JavaScript (42 assertions).
- [x] (2026-10-10) ADR-0042 supersedes permanence; full `bun run verify` and remaining settings browser checks passed. Applied local migration and confirmed no verification processes remain.

## Surprises & Discoveries

Permanence was enforced both in service code and a SQL-only trigger. Removing only
the form restriction cannot restore renames. Existing handle reservations are
separate: they prevent another hub taking a previously issued spelling.

## Decision Log

- 2026-10-10: User explicitly reverses permanent claiming and requests dead-code
  removal and a superseding ADR. User UUID/email policy is unaffected.
- 2026-10-10: Preserve spelling reservations against other hubs, including after
  deletion. A hub may reuse its own prior handle. Old handles are not aliases;
  durable links use hub UUID. Keep an explicit Save handle button to avoid reserving
  intermediate spellings during autosave typing.

## Outcomes & Retrospective

Permanence removed from schema, API and settings. The upgrade test first proved
the old trigger rejects a rename, then applied the migration and renamed the same
hub repeatedly, preserving its UUID and all reservations. Schema parity passed.
The broad settings journey had a stale expectation that the field disappears; it
now asserts that Handle and Save handle remain available; its rerun passed (53
assertions). Autosave and failed-edit recovery checks also passed. Full
`bun run verify` passed. Local migration applied and schema inspection confirmed
claim removal. Local schema parity reports an unrelated pre-existing username
column width of 60 versus schema 20; clean-database parity passes. Recorded this
in the debt tracker without changing user data. No verification processes remain.

## Context And Orientation

`HubsService.updateHandle` and `reserve_hub_handle()` enforce the old policy.
`ProfileEditor` branches on `handleClaimedAt` and sends `confirmHandle`. Shared
profile types, DTOs and tests expose that mechanism. ADR-0033 also covers account
lifecycle, whose behavior remains accepted.

## Plan Of Work

Remove the claim timestamp from Prisma and shared profile output, confirmation
input and obsolete errors. Create a migration that removes only the permanent
check and timestamp while retaining reservations and all unrelated invariants.
Settings always offers the editable handle field and availability feedback.
Prove repeated rename, own-name reuse, cross-hub rejection, stable UUID links,
audit/no-op behavior and browser saves without JS.

## Concrete Steps

Use `prisma migrate dev --create-only` on an isolated scratch database, review
SQL, then apply it and check schema parity. Run focused handle/browser checks,
then `bun run verify` from the disposable checkout. Apply reviewed migration to
local development after verification; regenerate Prisma. Never reset app data.

## Validation And Acceptance

Previously claimed hubs can rename more than once and retain their UUID, content
and permissions. Claimed state is absent from API/schema/UI. Reserved names and
format/uniqueness checks remain authoritative. Shared UUID URLs still open. The
same owner may restore a previous spelling; other hubs cannot claim it. Native
and enhanced forms work and show a saved state. Full gate passes.

## Idempotence And Recovery

Migration deploy is repeatable. It removes obsolete claim metadata only; no hub,
user, collection, grant or reservation is removed. Test databases/listeners are
disposable. Preserve running user dev servers.

## Artifacts And Notes

API: `handle.e2e.spec.ts`; browser: `reading.browser.ts`; shared wire contracts.

## Interfaces And Dependencies

PATCH `/api/v1/profile` accepts `handle` without confirmation. Profile no longer
exposes a claim timestamp. Existing normalized handle availability and UUID routes
stay in place. `reserve_hub_handle` continues to reserve historical spellings.
