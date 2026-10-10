# Unify transactional authentication completion

## Purpose / Big Picture

Every completed passwordless sign-in or registration records exactly one
account-bound authentication success in the same transaction as its session.
Email, Google, passkeys, TOTP and recovery share this rule. Account creation
continues to require the approved consent/proof and optional-hub policies; no
new user-facing steps or compatibility routes are introduced.

## Progress

- [x] (2026-10-10) Inspect authentication writers, transaction wrappers and onboarding hooks.
- [x] (2026-10-10) Consolidate completion and app-owned onboarding; delete duplicate writers.
- [x] (2026-10-10) Test registration, ordinary login, factors, invitations, replay and rollback.
- [x] (2026-10-10) Update authoritative documentation and changelog; full verification passed.

## Context And Orientation

`auth/delivery-auth.ts` wraps email and invitation proofs in a transaction;
`auth/security-handler.ts` does the same for Google, registration and factors.
Both compose `create-auth.ts` with transaction-scoped persistence and the shared
authority lock. `security-plugins.ts` enforces account/factor/link policy after
Better Auth verifies credentials. It stamps completed sessions but excludes email
from its audit writer. Delivery separately stamps email sessions and records
`code.verify`; ordinary registration passes through neither success writer.
The User creation hooks assign usernames and optionally create a hub, but some
of that app policy remains inline in Better Auth configuration.

## Plan Of Work

Introduce one app-owned authentication completion function, called by the
post-verification policy hook after eligibility, factor and Google-association
checks. It completes a bound invitation, stamps session assurance and last login,
and writes `security.sign_in.<method>` with the same immutable actor/target user.
Remove email's separate stamping and successful `code.verify` writer. Keep code
issuance and rejected-proof evidence separate from successful authentication.
Centralize optional-hub/username onboarding behind the existing app module;
Better Auth hooks only adapt library lifecycle to app-owned functions. Share
the identical verified-account creation bridge for email and Google.

The library continues to own OTP/OAuth/WebAuthn/factor verification and sessions;
the application owns consent, identity policy, onboarding and workflow completion.
No credential implementation, route alias or historical success-event adapter is added.

## Validation And Acceptance

- Email registration, capture signup, existing email login and Google registration/login
  each produce exactly one account-bound success event and a verified session.
- Passkey, TOTP and recovery produce the same event contract after full verification.
- Pending creation consent, pending factors, invalid proof and session reads produce
  no successful authentication. Recovery identification/account actions stay proof-only.
- Invitation acceptance and its auth event commit together for email and factor paths.
- Audit/commit failure rolls back account, optional hub, session, last login, invitation
  and proof consumption as applicable; a retry succeeds once and replay adds nothing.
- No old successful `code.verify` writer or `method !== "email"` exception remains.

## Concrete Steps

Use Bun and the isolated disposable database runners from
`docs/runbooks/verification.md`. Run relevant auth e2e suites and browser passkey
journeys, then `bun run verify` in a separate working copy to preserve the user's
running development build. Tests use registered database/Redis ports and dynamic
owned server ports; close every owned server afterward.

## Idempotence And Recovery

No schema/data migration is needed. Existing one-use proofs and the authority lock
provide replay/concurrency protection; completion requires a new verified session.
Tests inject audit/commit failures only in disposable databases and remove triggers
in finally blocks. Preserve all unrelated working-tree changes.

## Decision Log

- 2026-10-10: One transactional completion operation owns all successful authentication
  evidence. Remove duplicate email handling instead of adding another exception.
- 2026-10-10: Preserve the approved explicit signup, same-email association and
  invitation policies. This refactor changes responsibility, not account consent.

## Surprises & Discoveries

- Email registration already stamped session assurance and last login in the hook,
  but the email audit exclusion left its success unrecorded. Ordinary email login
  also redundantly stamped those fields again in delivery.
- TOTP enrollment rotates its existing session. The delivery boundary now marks
  credential management explicitly so rotation preserves original assurance and
  cannot update last login or emit an extra sign-in event. Replay checks remain.
- The first focused runner ordered passwordless fixtures before invitation
  bootstrap, leaving an admin fixture that invalidated bootstrap assumptions.
  Canonical suite ordering fixes this test-harness issue; all five suites passed.

## Outcomes & Retrospective

Implementation and verification complete. Both email and Google
registration use the same verified-account bridge and app onboarding. All login
methods share completion, including factor-bound invitations. No successful
email-only audit writer or duplicate last-login/session stamping remains.

## Artifacts And Notes

Five focused API suites passed: account-self-service, administration, auth-delivery,
email-registration and passwordless-security. Registration tests inject a failing
database audit trigger and prove account/hub/session rollback with successful retry.
Production browser checks passed for passkey sign-in and native TOTP/recovery:
two journeys, 67 assertions, including exact authentication events. These runners
closed their owned listeners. Full `bun run verify` passed in the isolated working
copy, including the complete API suites, web tests, builds and typechecks. ADR-0046
records the shared completion boundary; auth design docs and the changelog agree.

## Interfaces And Dependencies

Completion consumes application IDs/methods and transaction-scoped Prisma, never
browser claims or tokens as audit data. Better Auth types remain inside the auth
adapter. App-owned onboarding remains callable by future SSO. No web/API contract
changes are required; success audit actions become consistent across methods.
