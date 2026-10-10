# Consolidate audit records into one AuditLog

## Purpose / Big Picture

Use one Prisma AuditLog model and one Audit Log timeline for content, operations and authentication events. Preserve historical evidence, transaction guarantees, authorization and retention.

## Progress

- [x] (2026-10-09) Located AuditRecord, OperatorAudit and AuthAudit and their writers/readers.
- [x] (2026-10-09) Consolidated all three models; scratch preservation check retained all 3 fixtures including microsecond timestamps/replay metadata; local migration applied, schema parity clean.
- [x] (2026-10-09) Switched writers/readers/retention and unified API/screen; compacted account detail and linked the hub name per follow-up.
- [x] (2026-10-09) Verified migration preservation, permissions, microsecond pagination, full repository gate and browser behavior.
- [x] (2026-10-09) Follow-up: sharing keeps Copy link visible during hydration and uses one contextual return link; social destinations are deferred.

## Surprises & Discoveries

Authentication had a third audit model; its evidence is retained for 90 days. Operations evidence is retained for 365 days; content attribution must remain durable. PostgreSQL timestamps retain microseconds while JavaScript Date does not: the unified reader filters and cursors with the exact database timestamp to avoid losing events at a page boundary.

## Decision Log

- 2026-10-09: The user explicitly requests a single model, not just a combined UI. Event category retains authorization/retention distinctions without separate tables or UI contexts.

## Outcomes & Retrospective

One AuditLog model/table now holds all three event categories without losing historical evidence. The unified timeline retains permission boundaries, replay guarantees and category-specific retention. Account metadata is more compact and the hub name links to its stable ID route. Sharing uses an explicit local return path, with no separate Cancel control.

## Context And Orientation

Prisma schema is apps/api/prisma/schema.prisma. Common audit helpers and operations/collections services own reads/writes; authentication writes in delivery-auth.ts. Content attribution also reads audit history.

## Plan Of Work

Create AuditLog and migrate all rows atomically. Update all delegates, raw SQL, retention and fixtures. Read the authorized timeline through /api/v1/manage/audit with one cursor. Remove UI context switching.

## Concrete Steps

Generate create-only against a disposable migrated database, review SQL, deploy and compare schema. Run bun run verify and bun run test:browser in the existing scratch checkout to avoid disturbing the live web build.

## Validation And Acceptance

Exactly one audit model/table; IDs and evidence preserved from all three old tables. No unauthorized private hub records. Filter before globally ordered pagination. No My hub/Service tabs. Replay, rollback, retention and attribution still work.

## Idempotence And Recovery

Migration runs in a transaction; duplicate IDs or replay keys fail before old tables are removed. No data reset or fabricated backfill. Keep historical migrations unchanged.

## Artifacts And Notes

- `/tmp/unified-audit-e2e.log`: full isolated API e2e suite passed.
- `/tmp/unified-audit-final-api.log`: final operations suite, 22 passed / 154 assertions, including exact microsecond cursor boundaries.
- Scratch migration fixture comparison preserved all original fields in all three records. Scratch and local Prisma parity: No difference detected.
- `/tmp/unify-audit-scratch-verify-final.log`: full `bun run verify` passed in the scratch checkout.
- `/tmp/unify-audit-browser-final.log`: 51 browser journeys passed; the new direct-entry return test exposed browser history returning to about:blank. Contextual return links now use the explicit validated entry path instead.
- `/tmp/share-navigation-browser-final.log`: final changed browser journey passed with and without JavaScript, including clipboard contents, visible/disabled initial controls, contextual labels, retained filters, reloads and direct-entry fallback.
- `/tmp/share-navigation-types-final.log`: final web build/typecheck passed; final formatting, lint, doc links and diff whitespace checks passed.
- Inspected updated account profile, unified audit and desktop/mobile Share screenshots. Long session lists retain natural document scrolling.

No production deployment or commit is requested.

## Interfaces And Dependencies

Backend authorization remains authoritative; the shared types package exposes no Prisma types. Legacy scoped endpoints can remain compatibility views of the single model.
