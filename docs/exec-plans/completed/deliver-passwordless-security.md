# Deliver passwordless account security

> Historical milestone. Google entry and creation policy were subsequently amended by [ADR-0037](../../engineering-decisions/0037-inline-google-connection.md), [ADR-0038](../../engineering-decisions/0038-email-owned-google-onboarding.md) and [ADR-0039](../../engineering-decisions/0039-confirmed-google-account-creation.md).

## Purpose / Big Picture

People can sign in using a passkey (device unlock), Google for an existing
account, or the existing email code. Enrolled protection cannot be bypassed by
choosing email or Google. Settings supports authenticator enrollment, passkeys,
and single-use recovery codes; Support explains setup and recovery.

## Progress

- [x] (2026-10-10) Confirmed user authorization, inspected Pigfarm and Better Auth 1.6.23.
- [x] (2026-10-10) Recorded ADR-0035 and focused design; implemented additive schema, paired Google configuration and protected authentication boundary.
- [x] (2026-10-10) Implemented passkey/Google sign-in and reauthentication, factor challenge, security settings and Support.
- [x] (2026-10-10) Eight integration tests pass: Google linking/no-signup, pending sessions, recovery concurrency/rollback, TOTP replay/limits and invitation completion. Native no-JS authenticator recovery and positive WebAuthn browser journeys pass.
- [x] (2026-10-10) Negative WebAuthn UV/origin/replay cases pass; full `bun run verify` passes. Reviewed security/sign-in/setup/challenge layouts at 390/768/1280/1440 in both themes.
- [x] (2026-10-10) Copied only Google client ID/secret to ignored local API env and applied the additive development migration without resetting data.
- [x] (2026-10-10) Reviewed the diff and recorded the completed milestone. Browser coverage: 70 passing scenarios in the full run; the two test-fixture failures were corrected and both pass on rerun (72 scenarios total).

## Surprises & Discoveries

Better Auth 1.6.23's two-factor hook only matches password-based sign-in paths.
Pigfarm widens that hook for email OTP and Google callbacks. The installed
version's enrollment endpoint can replace an existing authenticator; the app
must reject that operation until deliberate removal. NSLinkHub serializes auth
mutations and delivery under the shared database authority lock. Browser passkeys
require localhost rather than numeric loopback, so the isolated browser harness
now uses localhost. Native setup tests must open the manual-key disclosure before
reading its rendered text. Better Auth requires preserving the original factor
hook response/header envelope when extending OAuth matching. The shared HTTP
adapter remains the only browser fetch boundary. Security metadata reads use
the read budget rather than consuming shared authentication attempt budgets.
Google browser fixtures inspect the real native redirect and cookies, then
serve a local response so no synthetic credentials reach the provider.

## Decision Log

- 2026-10-10: User accepted passkeys, Google existing-account sign-in, optional
  TOTP and protected recovery. Implement locally now while preserving the
  future nsauth boundary; see ADR-0035.
- 2026-10-10: Require WebAuthn user verification on the server, not just the
  browser preference. No trusted-device bypass in this milestone.
- 2026-10-10: Reuse only Google's client ID/secret from Pigfarm's local env for
  local development. Never copy unrelated settings or print credentials.

## Outcomes & Retrospective

Implementation and local validation complete. Google console redirect registration is external
configuration. Live initiation returns 200 with PKCE S256 and the correct public
callback. Google itself returns `Error 400: redirect_uri_mismatch`; the client
owner must register `http://localhost:3000/api/v1/auth/callback/google` before
interactive acceptance. No credentials were printed or committed.

## Context And Orientation

`apps/api/src/auth/delivery-auth.ts` owns the public allowlist, email proof
binding, transactions and final session/invitation completion. `create-auth.ts`
composes Better Auth. Prisma credentials remain API-private. Web native forms
in `apps/web/src/app/forms/[action]/route.ts` forward cookies and resume saved
actions only after completed authentication. `resolveSessionUser` remains the
sole product session boundary. Product identity and authorization remain UUID-based.

## Plan Of Work

Add an additive migration for Better Auth's passkey and two-factor records and
application session assurance. Add validated optional Google configuration and
server-side policy hooks. Extend the transaction boundary to the selected
OAuth/WebAuthn/factor endpoints, preserving existing proof, invitation and
account-lifecycle semantics. Add Settings security management, sign-in options,
a factor challenge and Support instructions. Protect enrollment/removal with
recent completed authentication, revoke stale access after changes, and make
recovery consume a code without silently removing factors.

## Concrete Steps

Use Bun in the repository root. Install matching Better Auth passkey and browser
WebAuthn dependencies. Generate the migration with `prisma migrate dev
--create-only` against a disposable database, review SQL, and prove fresh-chain
parity. Run focused API and browser journeys, then `bun run verify`. Production
builds run in `/tmp/nslinkhub-review-20261010`, separate from the active dev server.

## Validation And Acceptance

- Google cannot register, implicitly enroll, or link an unproven external email.
- Email/Google for protected users yields no usable cookie or bearer session
  before TOTP, registered passkey or recovery proof succeeds.
- UV-required passkeys authenticate in one flow; wrong origin/RP/challenge,
  missing user verification and replay fail.
- Authenticator enrollment requires confirmation; existing factors cannot be
  overwritten. Recovery codes are single-use under concurrent requests.
- Inactive accounts, expired challenges, stale sessions and cross-origin writes
  fail closed. Alternate raw routes cannot bypass the policy.
- Invitations and interrupted actions finish only after all required proof;
  ordinary authentication never grants operator authority.
- Security settings explain setup/removal/recovery. Email and TOTP forms work
  without JavaScript; passkeys explain their browser requirement.
- Inspect 390/768/1280/1440 layouts in both themes and run the canonical gate.

## Idempotence And Recovery

Use additive migrations; never reset development data. Test databases are
randomly owned disposable fixtures. Never copy local credentials into test
checkouts or tracked files. Preserve the pre-existing `apps/web/next-env.d.ts`
diff. A failed auth transaction must expose no successful proof/session cookie.

## Artifacts And Notes

- `bun run verify`: green in `/tmp/nslinkhub-security-final-20261010`;
  log `/tmp/nslinkhub-passwordless-verify-final.log`.
- Browser regression: `/tmp/nslinkhub-passwordless-browser-all.log` (70 pass;
  outdated single-form selector and provider-navigation fixture corrected),
  `/tmp/nslinkhub-passwordless-browser-followup.log` (both corrected tests pass).
  Passkeys are tested with real Chromium WebAuthn, including validly generated
  responses with UV unset, incorrect origin and replay. TOTP/recovery and Google
  initiation also run with JavaScript disabled.
- Fresh migration chain: no difference detected by Prisma; local additive
  migration applied without resetting development data.
- UI review: retained the product's restrained settings/verification register.
  Hierarchy/spacing 8/10, clarity 8/10, interaction/recovery 9/10, theme/responsive
  consistency 9/10. Tightened form spacing, separated checkbox labels, wrapped
  long passkey names and explained unsupported browsers. No horizontal overflow
  at the four required widths; local QR image loading is asserted.
- Local credential scan found neither Google value in proposed tracked/untracked
  changes. The existing generated `next-env.d.ts` development diff is preserved.
- Live Google initiation returns PKCE S256 and the exact public callback;
  Google returns `redirect_uri_mismatch` until the client owner registers it.
  Real user consent/sign-in acceptance is not claimed by mocked tests.


References: Pigfarm ADR-0008 and `auth-passwordless-plugin.ts` (read-only),
https://better-auth.com/docs/plugins/2fa,
https://better-auth.com/docs/plugins/passkey,
https://developers.google.com/identity/gsi/web/guides/verify-google-id-token.

## Interfaces And Dependencies

Better Auth 1.6.23 owns credentials, challenges and sessions. Product-owned
policy wraps its primitives. WebAuthn uses the public origin's hostname as RP
ID; production requires HTTPS. Google OAuth uses only identity scopes and
explicitly disables both implicit and requested signup. Secret inputs support
`_FILE`. Future nsauth migration must preserve local UUIDs and domain authority.
