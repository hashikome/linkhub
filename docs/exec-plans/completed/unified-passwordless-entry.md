# Unify passwordless entry and email-owned Google onboarding

> Historical milestone. The extra new-account email code in this milestone was superseded by [ADR-0039](../../engineering-decisions/0039-confirmed-google-account-creation.md).

## Purpose / Big Picture

Offer Continue with email and Continue with Google. Google OAuth alone never
creates an account. Its existing inline linking flow can now verify an email
code, create a missing product account, and save the connection atomically.
After email entry, a registered passkey can complete sign-in without an emailed
code; invitations still require their dedicated email proof.

## Progress

- [x] (2026-10-10) Confirmed that a new Google user must complete email-code onboarding inline.
- [x] (2026-10-10) Implement backend proof binding, independent-flow cancellation and passkey email binding.
- [x] (2026-10-10) Update entry, linking and factor screens and durable policy documents.
- [x] (2026-10-10) Prove registration, existing login, invitations, confirmation, passkeys and rollback.
- [x] (2026-10-10) Full verification and focused browser journeys passed; owned test servers exited.

## Surprises & Discoveries

The previous cancellation patch omitted confirmation form cookie forwarding and
invitation issuance. Existing passkeys are offered before email entry, while
email previously sent a code immediately. Better Auth queues database after-hooks;
new-account proof binding instead relies on the delivery transaction's locked
absence check before native OTP, and its verified newly created user afterwards.

## Decision Log

- 2026-10-10: Extend inline linking to new email-verified accounts, superseding
  only the existing-account restriction in ADR-0035/0037. Provider-only signup
  remains disabled. User explicitly confirmed this policy.
- 2026-10-10: Email entry must not disclose account existence or enrolled methods.
  Offer the same passkey/email-code continuation for every address; bind passkey
  proof to that email in the backend. Email entry itself proves no identity.

## Outcomes & Retrospective

Completed backend and UI changes with explicit new-account consent, plain user
copy, same-email Google enforcement and email-first passkeys. Both reported
cancellation regressions are fixed. Provider-only signup stays disabled and
invitations retain dedicated email proof. No migration, live data edit or
credential change was needed.

## Context And Orientation

`apps/api/src/auth/delivery-auth.ts` owns email and invitation proof transactions.
`security-handler.ts` wraps Better Auth OAuth and WebAuthn. `google-connection.ts`
holds encrypted pending provider identities. `security-plugins.ts` enforces
factor and linking completion. Native web forms only transport backend decisions.

## Plan Of Work

Extend pending Google proofs to represent a missing account without creating it.
Allow only email verification that creates that account in the same transaction
to finish such a proof. Preserve existing identity, lifecycle and factor checks.
Cancel abandoned linking when independent email/invitation flows start and forward
all deletion cookies. Bind email-first passkey ceremonies to the selected identity.
Use shared form components for two entry choices and passkey-first continuation.

## Concrete Steps

From the repository root, run Biome on changed source, `bun run check:docs`,
`bun run verify`, and focused `TEST_DIRECT_API=1 bun run test:browser` journeys.
Use a disposable checkout for builds to preserve the user's development `.next`.

## Validation And Acceptance

- Unknown Google identity creates no account/session before a valid email code.
- One code creates, verifies and connects exactly one account; replay, mismatch,
  expiry and rollback cannot link or create accounts.
- Existing Google accounts retain factor checks; a registered passkey completes
  email-first sign-in for the selected account without email or TOTP codes.
- Confirmation and invitation email flows discard unrelated Google state; no
  invitation grant or linking is possible without the appropriate proof.
- First-link capture survives authentication; native email flows work without JS.

## Idempotence And Recovery

No migrations or production data edits. All auth mutations use the shared
transaction lock. Tests use disposable databases and temporary ports. Preserve
the user's running servers; terminate all servers started by verification.

## Artifacts And Notes

`bun run verify` passed in a disposable checkout (API, web build/typecheck,
static boundaries, unit/integration and tooling checks). The latest focused
backend suite passed 9 tests / 289 assertions, including different-email linking
rejection and rollback. Six initial browser journeys passed / 180 assertions;
first-link capture and interrupted sharing recovery passed in JS and native-form
modes. The expanded passkey browser journey passed / 44 assertions, including
selected-email mismatch, user-verification enforcement, no emailed code and
Google first-proof completion with a passkey. Synthetic OAuth responses test our
callback contract without claiming a live Google-provider acceptance run.

Mobile/light/dark creation and sign-in screenshots were inspected. All temporary
verification servers exited; the user's development servers were preserved.

## Interfaces And Dependencies

Better Auth and its passkey plugin stay pinned to 1.6.23. Cryptographic proof,
OAuth state/PKCE and sessions remain library-owned. Business rules stay in NestJS.

Latest copy decision: users see Create your account or Sign in, with their email
and explicit consent; linking mechanics stay out of onboarding copy. The API
checks matching Google email even on subsequent sign-ins and redirects mismatches
to email entry. No Google-domain heuristic restricts ordinary email access.
