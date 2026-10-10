# Guide account recovery and keep account email fixed

## Purpose / Big Picture

Ordinary sign-in and first-link capture no longer advertise recovery controls.
After a correct email code, an eligible inactive account sees exactly one action:
reactivate a self-deactivated account, or cancel an unexpired deletion. The
pending destination survives recovery and the subsequent fresh sign-in. Account
email also stays fixed: retire its old API and keep any future controlled identity
change behind a dedicated POST action, never generic profile updates.

## Progress

- [x] (2026-10-10) Inspect lifecycle authority and ordinary sign-in suppression.
- [x] (2026-10-10) Implement state-bound recovery proof and contextual web screen.
- [x] (2026-10-10) Focused API proof/rollback tests and both browser journeys passed; documented ADR-0040.
- [x] (2026-10-10) Retire email change, preserve allowed profile edits, and record ADR-0041 plus backlog.
- [x] (2026-10-10) Full `bun run verify` passed, including isolated identity/operations cases; verification exited and test listeners closed.

## Surprises & Discoveries

Ordinary email issuance silently skipped every inactive account. The public
account page offered both recovery actions without knowing which applied.
Browser checks also found that server reads forwarded only session cookies;
recovery preview now explicitly forwards the recovery cookie through the auth
allowlist, alongside the existing Google continuation preview.

## Decision Log

- 2026-10-10: User clarified that names and bios are profile edits; user UUID
  and email are identity fields. Retire email change now; any future process is
  a dedicated POST action after proof and notification policy is settled (ADR-0041).

- 2026-10-10: Reveal state only after an email code proves ownership. Issue a
  short-lived backend recovery capability, never a usable session.
- 2026-10-10: Keep existing semantics: cancellation leaves the account inactive,
  recovery cannot lift operator restrictions and authentication remains required.

## Outcomes & Retrospective

Implemented backend-selected recovery and destination preservation. Both browser
journeys passed with/without JavaScript (2 tests, 50 assertions); API/web types
passed. Full `bun run verify` passed with expiry/version/restriction coverage
and fixed-email rejection. No live credentials or identity data were changed.

## Context And Orientation

`apps/api/src/auth/delivery-auth.ts` issues purpose-bound email codes.
`account-recovery.ts` binds verified recovery to UUID, email, action and version.
`security-handler.ts` exposes preview/consent; `account-lifecycle.ts` remains the
single mutation authority. Web account/sign-in pages only render backend results.

## Plan Of Work

Allow eligible inactive users through email proof without a session, then stage
an opaque recovery cookie. Preview selects the single action. Confirmation
rechecks eligibility, consumes proof with revocation and audits atomically.
Remove generic recovery links and preserve the sealed sign-in destination.
Retire old email-change issuance/completion and the native user-update route;
keep validated product profile PATCH and historical intent cleanup. Test rejected
identity writes and successful name/bio edits. Update current designs and backlog.

## Concrete Steps

Run Biome, API/web types, focused account-self-service API tests and browser
journeys, then `bun run verify` from a disposable checkout to protect dev builds.

## Validation And Acceptance

Profile PATCH rejects user UUID/email atomically; PUT and retired/native update
routes are unavailable. Allowed name/bio updates work; rejected identity changes
preserve sessions, grants and invitations. No schema changes or live data edits.

Anonymous issuance reveals no state. Wrong codes cannot preview or mutate.
Valid proof yields only the applicable action, with no session. Forgery,
expiry, changed state, replay and rollback cannot restore access. Capture
destination survives with/without JavaScript. Stop verification servers.

## Idempotence And Recovery

No schema or live data edits. Tests use disposable databases and temporary ports.
Recovery records expire after ten minutes and revoke alongside account proofs.

## Artifacts And Notes

Tests: `apps/api/test/account-self-service.e2e.spec.ts`,
`apps/api/test/browser/reading.browser.ts`, `apps/api/test/identity.e2e.spec.ts`,
`apps/api/test/auth-delivery.e2e.spec.ts` and `apps/api/test/operations.e2e.spec.ts`.

The initial combined-file identity test run passed the changed cases but polluted
an audit pagination fixture with another file's data. Canonical verification
runs each e2e file in an isolated process; use that runner for full acceptance.

## Interfaces And Dependencies

Email verification may return `{ accountRecovery: true }` plus an HttpOnly cookie.
GET `/account/recovery` returns the eligible action only after proof. POST
`/account/recovery/confirm` accepts `{ confirm: true }`; the backend selects the
action. Better Auth owns code proof; existing account lifecycle owns mutation.
