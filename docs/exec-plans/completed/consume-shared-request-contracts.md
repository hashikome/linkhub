# Consume shared API request contracts

## Purpose / Big Picture

Make the existing web client consume shared request contracts, with backend DTOs
checked against those same wire shapes. Backend validation, authorization and
workflow decisions remain authoritative; TypeScript contracts describe messages,
not permissions or runtime acceptance.

## Progress

- [x] (2026-10-09) Compared Pigfarm's shared types, API adapters and backend-authority design.
- [x] (2026-10-09) Identified untyped web payloads and missing commentsEnabled in UpdateCollectionRequest.
- [x] (2026-10-09) Connected backend DTOs and web payloads to shared request types; added 18 exact DTO/contract checks.
- [x] (2026-10-09) Updated conventions, ADR-0003 and CHANGELOG; `bun run verify` passes.
- [x] (2026-10-09) Focused browser checks passed: 9 journeys, 341 assertions, covering native and enhanced forms.

## Surprises & Discoveries

Pigfarm consumes shared response types, guards and backend capabilities, but its
HTTP mutation helper also accepts unknown bodies. It is a reference for ownership
boundaries, not a generated client to copy. NSLinkHub's unreferenced request types
had already drifted: UpdateCollectionDto accepts commentsEnabled, the wire type
omitted it. `implements` alone cannot catch missing optional fields in a contract.

## Decision Log

- Use imported types and `satisfies` at payload construction; retain generic HTTP
  transport and native form adaptation. No generated client or validator-library
  migration. Date: 2026-10-09.
- Keep runtime validation in API DTOs/services. Add compile-time exact DTO/contract
  checks, including optional keys; unknown external form/analytics input stays
  unknown until validated, never cast into a trusted request. Date: 2026-10-09.

## Outcomes & Retrospective

Web payload construction now consumes shared collection, capture, profile,
comment, sign-in, share-entry and operation inputs. Backend DTOs implement the
corresponding interfaces; 18 exact parity checks cover DTO fields and types.
UpdateCollectionRequest includes commentsEnabled, and comment/transfer inputs
are exported. Form state and raw input retain their distinct responsibilities.

Full `bun run verify` and nine focused production browser journeys passed.
The latter exercised sign-in/recovery, invitations, account operations, capture,
discussion, profile edits, collection actions, contextual sharing and share-open
tracking, including no-JavaScript fallbacks. No migration, new dependency,
generated client, commit or external publication was needed.

## Context And Orientation

packages/types exports framework-free wire contracts. apps/api uses decorated
DTOs and raw auth handlers; apps/web uses lib/form-server.ts and lib/http.ts for
HTTP and native forms. Pigfarm's reference is docs/designs/backend-authority.md
in the sibling hashikome/pigfarm repository; this repo's ADR-0003 is authoritative.

## Plan Of Work

Align exported inputs with backend DTOs, connect DTO declarations and web-created
payloads to shared types, add missing comment/transfer inputs used by the web,
and enforce exact DTO shape parity at API typecheck. Preserve raw input forwarding
for forgiving share-open metadata. Update conventions and ADR-0003 clarification.

## Concrete Steps

Use Bun formatting, boundary checks, API/web typechecks and `bun run verify` in an
isolated snapshot. Existing API integration tests verify runtime validation; use
browser checks only if runtime navigation or form semantics change.

## Validation And Acceptance

Web-created payloads use existing shared inputs where applicable. Typecheck fails
on optional-field drift as well as required-field drift. No Prisma/backend imports
enter web. No authority moves from API to client; runtime protocols stay intact.

## Idempotence And Recovery

No schema changes or external writes. Preserve existing uncommitted work. Build in
an isolated temporary checkout so the running development app is undisturbed.

## Artifacts And Notes

Full verification: `/tmp/shared-contract-verify.log` (passed).
Focused browser checks: `/tmp/shared-contract-browser.log`.
Isolated checkout: `/tmp/nslinkhub-cleanup-RwtlL9`.

## Interfaces And Dependencies

@nslinkhub/types, Nest class-validator DTOs, native URL-encoded forms, existing
HTTP adapter and backend authorization. No new dependencies.
