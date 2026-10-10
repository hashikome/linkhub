# Normalize audit identities and filters

## Purpose / Big Picture

Hub and service audit show current usernames while immutable UUIDs bind history.
Actor, target and hub filters have explicit meanings. UUIDs use readable suffixes
that expand to the complete reference, including without JavaScript.

## Progress

- [x] (2026-10-09) Inspected storage, audit readers, pagination and UUIDv7 guidance.
- [x] (2026-10-09) Implemented shared filtering, labels, ID inspection and event-time service hub attribution. Additive migration reviewed and applied locally.
- [x] (2026-10-09) Full bun run verify passed. Three production browser journeys passed with JavaScript and native fallback (76 assertions); UUID collision unit test passed. Migration diff reports no difference.
- [x] (2026-10-09) Updated service/Manage/interface contracts, ADR-0002 clarification, runbook and changelog.

## Surprises & Discoveries

Both audit models already store IDs without cascading entity relations. Hub reads
omit the username join. Service search currently treats a hub handle as its owner.
OperatorAudit previously lacked event-time hub context. Browser testing caught an
Action select accessible name that included option text; an explicit accessible
name fixed it, and all browser regressions then passed.

## Decision Log

- Keep full UUIDs authoritative; abbreviate the last eight hexadecimal digits,
  extending suffixes on collisions in loaded results. No short-ID lookup contract.
- Resolve username/handle lookup inputs to immutable IDs before continuation.
  Email lookup remains in Accounts. Current labels never rewrite history.
- Add nullable event-time hubId to service audit for collection operations. Leave
  historical rows unknown rather than infer history from current ownership.

## Context And Orientation

AuditRecord is the owner-only hub trail; OperatorAudit is the separately authorized
service trail. CollectionsService and OperationsService read them. AuditEvents
renders both; /manage/audit/more appends pages. Relevant contracts are in
packages/types/src/audit.ts and operations.ts.

## Plan Of Work

Add shared audit query resolution and scoped snapshot pagination; enrich hub
actors and targets. Capture service collection hub context at write time with an
additive reviewed migration. Use one web filter form and full-ID inspection UI.
Test renamed/deleted identities, scoped cursors, full-ID references and rendering.

## Concrete Steps

Run Prisma migrate dev --create-only from apps/api against a disposable database;
review SQL and generate client. Run focused API/browser tests, then bun run verify
in an isolated scratch checkout to avoid the running development build.

## Validation And Acceptance

Both scopes show current usernames and expand full UUIDs; unknown people retain
IDs. Filters distinguish actor from affected target and hub from owner. A rename
does not change an already-resolved filter. Hub access remains owner-only, cursors
cannot cross filters/scopes, and service hub history survives collection transfer.
Load more appends and maintains filters; native fallback and keyboard work.

## Idempotence And Recovery

No existing audit rows or applied migrations are rewritten. Migration adds a
nullable column/index. All tests use disposable databases; preserve other work.

## Artifacts And Notes

References: RFC 9562 section 5.7 and OWASP Logging Cheat Sheet. UUIDv7 starts with
a millisecond timestamp; an eight-digit suffix is only a display abbreviation.

## Interfaces And Dependencies

Bun, Prisma, Nest DTO validation and current API envelopes remain authoritative.
No Prisma types cross into web. Full UUIDs remain the only durable references.

## Outcomes & Retrospective

Shipped both audit views with resolved current usernames, explicit ID-bound filters,
scoped snapshot cursors and accessible full-ID inspection. New service collection
events retain event-time hub context without inventing historical ownership.
Existing records, authorization and private-content boundaries remain intact.
No compatibility layer or short-ID API was introduced. Verification logs:
`/tmp/nslinkhub-audit-verify.log` and `/tmp/nslinkhub-audit-browser.log`.
The local migration was applied and schema parity confirmed. No commit/push performed.
