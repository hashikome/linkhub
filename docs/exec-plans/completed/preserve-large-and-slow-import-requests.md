# Preserve large and slow import requests

## Purpose / Big Picture

Valid Unicode import edits must survive form parsing and sign-in recovery. Slow
uploads must retain the visitor's rate-limit bucket rather than sharing the web
server's bucket.

## Progress

- [x] (2026-10-11) Confirmed the 16 KiB encoded form limit and ingress-stamped proofs.
- [x] (2026-10-11) Implemented bounded import-row parsing and transport-time proof renewal.
- [x] (2026-10-11) Six focused tests / 44 assertions and two real-server browser tests / 25 assertions passed.
- [x] (2026-10-11) Full `bun run verify:isolated` passed, including database-backed API suites, web tests, production build and typecheck.

## Surprises & Discoveries

Thirty 80-character CJK tags exceed 21 KiB when URL encoded, despite being valid
API input. Request bodies can take longer than the API proof's 30-second expiry.

## Decision Log

- Keep 16 KiB for ordinary forms; allow 64 KiB for import-row only. This covers
  URL-encoded maximum tags, address, placement and form metadata with headroom.
- Treat ingress-stamped signed headers as trusted request context, verifying
  their signatures, purpose and address before renewing at the shared transport.
  Ingress overwrites browser headers. Context age is not API proof age; API
  expiry remains 30 seconds. Missing or invalid context fails before forwarding.

## Outcomes & Retrospective

Both defects are fixed. Maximum Unicode edits survive sign-in in native and
enhanced forms. Two concurrent 31-second uploads retain distinct visitor budgets;
the exhausted visitor is blocked while the other succeeds. The full gate passed.

## Context And Orientation

`apps/web/server.ts` stamps visitor proofs from the socket/trusted proxy chain.
`apps/web/server/source.ts` signs them; `src/lib/server-transport.ts` forwards
all visitor API calls. `src/lib/form-server.ts` bounds URL-encoded forms before
`src/app/forms/[action]/route.ts` dispatches import edits.

## Plan Of Work

Extract the bounded form parser into a testable helper and select the import
allowance by action. Renew verified ingress identity in the shared transport.
Test limits, tampering, concurrent visitors, delayed forwarding and real browser
sign-in replay. Amend ADR-0052 and the security/import documentation.

## Concrete Steps

Run focused web tests; then `bun run verify:isolated` and
`bun run verify:isolated test:browser --test-name-pattern 'resumes submitted import|slow import'`.

## Validation And Acceptance

Maximum Unicode tags round-trip without truncation, including after expiry.
Oversized bodies remain rejected and origin/content-type checks remain intact.
Forwarded proofs are fresh and domain-separated after delayed body buffering;
forged headers cannot select another visitor. Full verification passes.

## Idempotence And Recovery

No migration or development-data mutation. Tests use disposable databases.
Changes remain uncommitted; repeat isolated checks without touching dev output.

## Artifacts And Notes

Focused tests: `bun test apps/web/test/form-body.test.ts apps/web/test/visitor-source.test.ts apps/web/test/source.test.ts`. Browser evidence: `/tmp/import-request-browser2.log`.
Concurrent isolated installs hit EDQUOT; sequential execution resolved it. Full
verification evidence: `/tmp/import-request-verify2.log` (exit 0).

## Interfaces And Dependencies

No new dependency. Existing HMAC domains and API verification remain unchanged.
The web entry point must always overwrite incoming source headers before Next.
