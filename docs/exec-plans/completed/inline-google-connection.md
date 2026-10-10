# Connect Google during sign-in

> Historical milestone. The existing-account-only Google policy in this milestone was superseded by [ADR-0038](../../engineering-decisions/0038-email-owned-google-onboarding.md) and [ADR-0039](../../engineering-decisions/0039-confirmed-google-account-creation.md).

## Purpose / Big Picture

Register with email, then use Google with the same email. First-time ownership
verification happens within sign-in and the backend saves the association;
discovering a separate Settings step is never required. Google cannot register
a user and enrolled protection still gates completion.

## Progress

- [x] (2026-10-10 09:00Z) Identified the external-email linking restriction and
  reviewed Better Auth's callback, email OTP and factor completion paths.
- [x] (2026-10-10 09:39Z) Implemented backend pending connection and inline email verification.
- [x] (2026-10-10 09:39Z) Updated product, ADR-0037, security design, support and local runbook.
- [x] (2026-10-10 09:39Z) Verified positive/negative, rollback and MFA API cases; native browser flow and `bun run verify` pass.

## Surprises & Discoveries

The web initially forwarded only session cookies on server reads. The native
browser test caught the resulting false-expired screen; the pending-status read
now forwards its auth cookie. Playwright's request client under Bun also required
using the real native Sign out form and intercepting the provider-start redirect.

Better Auth validates OAuth state and exchanges the code before mapping Google's
profile. Its `account_not_linked` response currently sends external-email users
to Settings. The validated subject can instead remain pending until an existing
local account completes authentication. OAuth access tokens are unnecessary for
this sign-in-only association.

## Decision Log

- 2026-10-10: Keep authoritative Gmail/Workspace automatic linking; move the
  external-email proof into the current sign-in. Store encrypted, expiring,
  browser-bound pending identity and consume it with completed authentication,
  using Better Auth's account adapter. No schema or secret change is needed.

## Outcomes & Retrospective

Implemented the intended email-registration → same-email Google flow. First-time
external-email proof stays inline; connection and authenticated session commit
together after enrolled protection. Existing direct-backend-routing work remains
intact. No schema, credentials or callback registration changed. Work is ready
for review; no commit or deployment was made.

## Context And Orientation

`apps/api/src/auth/create-auth.ts` maps provider claims; `security-handler.ts`
owns OAuth HTTP policy. `delivery-auth.ts` provides transactional email OTP;
`security-plugins.ts` gates factors and stamps completed sessions. Web native
forms render/transport that API contract. ADR-0035 currently requires explicit
recent-session linking for external-email Google users; ADR-0037 amends the UX.

## Plan Of Work

Capture only a state-validated callback's verified external-email subject after
the native account-not-linked result. Bind it to the existing user UUID, current
email/version and a random HttpOnly cookie for ten minutes. Reuse existing OTP
delivery, caps and factor gate; link only inside the transaction that completes
authentication. Add an inline known-email screen and cancellation, preserve the
original destination, and replace Settings-detour copy. Keep optional management.

## Concrete Steps

Run focused passwordless API and browser checks in the disposable review checkout,
then `bun run verify`. Use the repository verification runner and disposable DB;
do not rebuild the user's running web output or occupy ports 3000/4000.

## Validation And Acceptance

Existing authoritative emails link directly. External-email Google users see
inline verification and are connected after valid local proof; a subsequent
Google login works. Unknown/unverified providers never create users. Wrong email,
invalid state, replay, expiration, account changes and invalid factors cannot
link. Rollback preserves pending proof and emits no session. Native forms work
without JavaScript and keep return destinations.

## Idempotence And Recovery

No migration. Pending records expire and are consumed once; restart Google after
expiry/cancellation. Tests use synthetic identities and isolated databases.

## Artifacts And Notes

- Full `bun run verify` passed in `/tmp/nslinkhub-security-final-20261010`;
  log `/tmp/nslinkhub-inline-google-verify.log`. Final read-budget addition also
  passed its five focused middleware tests.
- Passwordless API suite: 8 pass, 195 assertions, including inline proof,
  wrong email, rollback, enrolled recovery factor, expiry, account version/email/
  availability changes, cancellation and callback replay. Synthetic provider only.
- Direct-backend native browser flow: 1 pass, 24 assertions; cancellation,
  inline email verification, return to Notifications and subsequent Google login.
  `/tmp/nslinkhub-inline-google-browser.log`.
- Screenshots inspected at 390/light and 1280/dark; overflow checked at 390, 768,
  1280 and 1440 in both themes. Existing verification components remain unchanged.
- Browser acceptance found a missing pending-cookie bridge on server reads;
  corrected that exact endpoint. Read budgets now preserve signed visitor
  attribution while callbacks retain auth-attempt limits.
- Documentation links and diff whitespace pass; local Google credential scan
  confirms no credential values in proposed changes. User dev ports untouched.
- The provider exchange/consent is synthetic in automated tests. Real Google
  consent can be retried using the existing port-4000 callback configuration.

## Interfaces And Dependencies

Better Auth 1.6.23 owns OAuth, OTP, factors and persistence primitives. API owns
pending association policy and audit. Web receives only the pending email, never
provider subject or tokens. Shared authority locking makes completion atomic.


## Review follow-up: abandon a pending association on ordinary sign-in

A pending Google cookie previously bound every later email/passkey attempt to
its account, so leaving the inline page without Cancel blocked account switching.
The API now discards that pending record when ordinary email issuance or a
standalone passkey challenge starts. Cookie deletion follows transaction commit;
Google email proof and passkey factor continuation explicitly preserve the flow.
Wrong-identity and stale-proof checks remain in force during continuation.

Native code forms forward cancellation cookies, including when issuance is
rate-limited. Failure transport forwards only the Google-cookie deletion, never
session-creation cookies. Backend regression coverage includes cancellation,
identity mismatch, preserved continuation, rollback and replay. Browser coverage
switches accounts after leaving Google linking without Cancel and exercises real
passkey authentication with a virtual authenticator. `bun run verify` passed,
including the backend restart regression and 24 web tests. Both focused browser
journeys passed (69 assertions). Temporary test servers were closed; the user's
development servers were preserved.
