# Preserve audit denials, current access and tracked link copies

## Purpose / Big Picture

Authenticated operator audit denials survive the response error. Manage Access
counts direct shares and enabled remembered link grants. Copying a newly issued
or rotated collection link creates a tracked share with the current token.

## Progress

- [x] (2026-10-09) Inspected all three findings and implemented focused fixes.
- [x] (2026-10-09) Added denial persistence, active-link access counts and
  generated-link copy regressions; focused browser tests passed (3 tests,
  127 assertions), including two rotations and existing sign-in continuation.
- [x] (2026-10-09) Full verification passed; docs and changelog updated; plan closed.

## Surprises & Discoveries

withAuthority joins nested calls. Throwing from run inside managedAudit rolls
back its denial record. ShareLink also retains copied URLs in state, so a newly
rotated link must remount it to avoid reusing the previous token/tracking entry.

## Decision Log

Keep operator classification under the authority lock; return a value/error
outcome from the inner runner and throw only after the outer transaction commits.
Use the same share predicate for selecting people and counting their grants.
Pass the issued token explicitly and key ShareLink by its issued URL.
These restore existing rules; no product decision or schema change is needed.

## Outcomes & Retrospective

All three review findings are fixed. HTTP regressions prove operator and admin
bearer denials and invalid-cursor denials persist exactly once, followed by a
successful audited read. Access regressions cover direct-only, link-only and
mixed grants through disable/re-enable, retaining stored link records. Production
browser tests verify issued tokens, fresh tracking after repeated rotation,
idempotent copies, recipient opens and existing sign-in continuation.

Business rules remain in the backend. Existing uncommitted work is preserved;
no schema or dependency changes, commits, pushes or development resets.

## Context And Orientation

OperationsService.run owns denial auditing with a work savepoint. managedAudit
composes it inside an authority transaction. CollectionsService.listPeople feeds
Manage Access. CollectionOperationFields renders one-time link operation results;
ShareLink creates tracking entries via the existing sharing API.

## Plan Of Work

Exercise bearer and invalid-cursor denials over HTTP and verify stored evidence.
Test active/disabled link grants alongside direct grants and unrelated hubs.
Browser-test create, rotate, repeated copy and tracked recipient opens.

## Concrete Steps

Run bun run verify and focused bun run test:browser --test-name-pattern checks.
Use existing disposable database harnesses and local services.

## Validation And Acceptance

Denied requests remain errors while their audit records commit exactly once.
Disabled link-only people disappear and mixed-grant counts decrease. Rotation
creates a fresh tracked URL; repeating a copy reuses its entry; recipient opens
increment that entry. Existing permission and native fallback behavior remains.

## Idempotence And Recovery

Preserve the dirty tree. No commits, pushes, database resets or new dependencies.

## Artifacts And Notes

- API typecheck passed (`/tmp/review-evidence-typecheck.log`).
- Browser verification passed (`/tmp/review-evidence-browser.log`): 3 tests,
  127 assertions, no failures; production compilation/typechecking passed.
- An earlier review build was stalled at page-data collection and held the
  Next.js lock. Identified and stopped that build and its workers, then reran
  successfully. No source files were removed.
- Full `bun run verify` passed: `/tmp/review-evidence-verify.log` (API build,
  typecheck, unit/e2e; web tests, production build/typecheck; repository checks).
- Documentation links and whitespace checks passed.

## Interfaces And Dependencies

Only internal operation state gains the issued token already present in its URL.
Public API contracts and backend authorization remain authoritative.
