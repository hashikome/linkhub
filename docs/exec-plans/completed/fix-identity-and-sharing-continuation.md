# Fix identity and sharing continuation

## Purpose / Big Picture

Resolve the five review findings after Collaborators and routes. Expired collection
operations resume for the same account, private sharing destinations survive sign-in,
PUT budgets follow individual visitors, and first hub creation always generates valid
handles. Usernames are lowercase letters/digits with single internal hyphens (3–60
characters); hyphens do not distinguish availability. Dots are invalid. App route
names, including `share` and hyphenated variants, remain reserved.

## Progress

- [x] (2026-10-09) Inspected review findings and existing working tree; preserved prior work.
- [x] (2026-10-09) Implemented backend identity rules, migration corrections and visitor attribution.
- [x] (2026-10-09) Implemented sharing returns and account-bound replay, including one-time link tokens.
- [x] (2026-10-09) Added regression coverage, durable policy references and verification evidence.

## Surprises & Discoveries

The link-sharing PUT returns its new token only once. Resuming that operation must
retain the returned token for the sharing screen. Bun rejects Prisma thenables in `expect(...).rejects`; regression tests wrap them
in `Promise.resolve` so the intended constraint check runs. Pending-action destinations must
be canonical under `safeReturn` for the existing account-bound replay check to match.

## Decision Log

- 2026-10-09 / user: Predeployment; no compatibility exceptions. `share` stays reserved.
- 2026-10-09 / user: Lowercase usernames, hyphens only; case and hyphen placement do
  not create separate available usernames. Preserve chosen hyphens in display/routes;
  enforce availability with a backend identity key and database expression index.
- Correct the uncommitted people migration, including reserved-name backfill and
  deterministic collision handling. Do not reset the development database.

## Outcomes & Retrospective

All five fixes and the clarified username policy are implemented. The full
`bun run verify` gate passed. Browser verification initially passed 58/59 tests;
the new access journey used an exact label selector that did not match the
wrapped select's accessible label. Corrected that selector; both the failed
journey and the account-bound authority journey passed on the focused retry
(2 tests, 62 assertions, native and JavaScript). The other 57 tests passed in
the full run. No product changes followed that run; do not misreport the first
run as wholly green. Migration checks passed with no drift. All requested fixes
are complete, no work is deferred, and prior uncommitted work remains intact.

## Context And Orientation

Backend modules `users`, `hubs` and request-budget middleware own identity,
validation and visitor accounting. The web's `collection-operation.ts` delegates
writes to the API. Encrypted `pending-action.ts` cookies and the code verification
route already resume other expired mutations and bind them to the last account.
`http.ts` restricts sign-in destinations. The working tree contains substantial
previously completed, uncommitted milestones that must remain intact.

## Plan Of Work

Add normalized username lookup shared by availability and onboarding, a matching
SQL unique expression index and reserved-name constraint, and lowercase DTO input.
Fix hub suffix generation and PUT visitor attribution. Validate sharing return
parameters and store collection commands on 401 using existing encrypted pending
actions; retain newly generated tokens after replay. Add API, unit and native/JS
browser regression coverage, then record final behavior and verification evidence.

Focused browser retries had accumulated as copied `/tmp` runners. The existing
`tooling/verify-browser.ts` now forwards Bun test arguments, so targeted runs keep
the same build, canary checks and disposable database lifecycle.

## Concrete Steps

From repository root: `bun run verify` (full gate), `bun run test:browser`
(production browser suite). Use disposable test databases for migration checks;
run Prisma commands from `apps/api`. Never reset the user's development database.

## Validation And Acceptance

Different visitors have separate PUT budgets. Invalid proofs fall back to server
source. Boundary-length usernames produce valid suffixed hub handles. Equivalent
username claims cannot coexist, including direct SQL bypass; uppercase input saves
lowercase, dots fail, and `share` variants are reserved. Existing hub `share` gets
a usable fallback during migration. Sharing return paths reject malformed targets
and external returns. Expired mutations preserve inputs and execute only after the
same account verifies; generated link tokens remain available. Native and JS paths
work and failed authorization after sign-in cannot mutate data.

## Idempotence And Recovery

No commits or resets. Edits are additive to current work. Rewritten uncommitted
migration is checked from scratch and against pre-migration fixtures; already
applied development copies require the separately planned preproduction reset.
Verification uses disposable databases and can be repeated safely.

## Artifacts And Notes

Prior milestone verification is recorded in `deliver-collaborators-and-routes.md`.
Migration verification passed against populated pre-people fixtures and the full
chain: `/tmp/review-schema.log` (reserved-name fallback, collision backfill, direct
SQL rejection, preserved SQL objects, no Prisma drift). ADR-0026 records the
GitHub/npm naming precedents and the exact product-specific rules.
`/tmp/review-verify-final.log`: full verification passed. The first browser run
(`/tmp/review-browser.log`) was 58 passes and one selector failure; it is not
reported as green. Targeted retry `/tmp/review-browser-focused.log`: 2 passes, 0 failures, 62
assertions, 57 filtered out. The runner's filter passthrough replaces ad hoc
copies while keeping the existing verification lifecycle. Final static checks
are recorded in `/tmp/review-final-checks.log`.

## Interfaces And Dependencies

No new dependencies. Prisma types remain backend-only. Immutable UUID identities
continue to own authorization. The API, not browser availability feedback, enforces
identity uniqueness and collection permissions.
