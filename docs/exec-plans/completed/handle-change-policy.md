# Deliberate hub handle changes

## Purpose / Big Picture

Retired hub handles cannot be reused by anyone, including their original hub.
Owners can rename at most once every 30 days. Shared UUID links and freely
editable hub names remain unaffected. Backend and database enforce both rules.

## Progress

- [x] (2026-10-10) Inspect current rename, reservation, settings and migration paths.
- [x] (2026-10-10) Implement reservation and cooldown authority plus a reviewed migration.
- [x] (2026-10-10) Add settings policy and next-change date; API, SQL and JS/no-JS browser checks passed.
- [x] (2026-10-10) Supersede ADR-0042 with ADR-0043, document, pass the full verification gate, apply locally and confirm test servers closed.

## Surprises & Discoveries

Existing reservations already record all issued spellings, but allow reuse by the
same hub. A timestamp is needed to enforce cadence independently of normal edits.
Historical content audit entries have a null outcome; the migration includes
those successful entries as well as explicit success outcomes.

## Decision Log

- 2026-10-10: User forbids all reuse and requests 14–30-day cadence. Use 30 days.
- 2026-10-10: Generated initial handles can be customized immediately; the first
  successful rename starts the cooldown. Saving the unchanged handle is a no-op.
- 2026-10-10: Backfill existing changes from retained handle audit/reservation
  history. Do not reset a known recent change or invent a claim timestamp.

## Outcomes & Retrospective

Completed. Retired handles stay unavailable to every account, and a successful
rename starts a 30-day cooldown enforced by both backend and database. Settings
shows the next eligible change date while allowing other edits. Existing handle
history is preserved; stable hub IDs and shared references are unchanged.

## Context And Orientation

HubsService owns validation; reserve_hub_handle provides SQL reservation safety.
Profile settings render backend-derived next-change time; clients cannot set it.

## Plan Of Work

Add handleChangedAt and derive handleChangeAvailableAt in the profile response.
Reject recent renames and any previously used target in API and SQL. Timestamp
successful changes atomically with reservation/audit; no-op saves leave it alone.
Show the policy before saving and the next eligible date during cooldown.

## Concrete Steps

Generate migration create-only on a scratch database, review trigger/backfill,
run focused API/browser and upgrade/parity checks, then full bun run verify.
Apply locally with the known unrelated username-width drift recorded separately.

## Validation And Acceptance

No own/foreign reuse; no early rename by direct API or SQL. Names/bios still save.
Cooldown begins only on successful changes, survives retries/rollback, and allows
a fresh spelling after 30 days. Stable IDs and shares survive. Tests cover races,
current-handle no-op, migration history and JS/no-JS settings.

## Idempotence And Recovery

Additive timestamp migration preserves identities/content/reservations. Existing
local username type drift is unrelated. Never reset the application database.

## Artifacts And Notes

Focused handle API checks passed (9 tests); browser settings checks passed
(2 tests, 93 assertions) with JavaScript enabled and disabled. Mobile dark-mode
screenshot review confirmed the policy and next eligible date fit without overflow.
A disposable upgrade test exercised legacy rename/reuse history, proved the
latest successful audit wins over older reservations, preserved initial
eligibility, enforced cooldown/retirement in SQL, and found no schema drift.
Full `bun run verify` passed in an isolated checkout, including API integration
tests and the production web build. Migration `20261010130209_handle_change_policy`
was applied to the local development database; metadata checks confirmed the
new column and cooldown trigger. The previously recorded local username-width
drift is unrelated and unchanged. No verification processes remained afterward.

## Interfaces And Dependencies

Profile gains backend-derived handleChangeAvailableAt (future ISO date or null).
Handle changes remain explicit profile PATCH operations; unavailable targets return
handle_unavailable, and early changes return handle_change_cooldown.
