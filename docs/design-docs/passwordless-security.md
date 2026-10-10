# Passwordless account security

Status: implemented. Decision: [ADR-0035](../engineering-decisions/0035-passwordless-account-security.md).
Better Auth and `@better-auth/passkey` are pinned to 1.6.23 by the lockfile.

## Sign-in policy

| Primary method | Unprotected account | Passkey or TOTP enrolled |
| --- | --- | --- |
| Email code | Complete sign-in / email-owned onboarding | Pending factor, no usable session |
| Google | Existing account only | Pending factor, no usable session |
| Passkey | Registered credential required | Complete sign-in with server-verified user verification |

A pending login accepts enrolled TOTP, a registered passkey for the same user, or
one recovery code. TOTP/recovery alone cannot start a login. A signed ten-minute
factor cookie references Better Auth's challenge; encrypted app context binds
user ID, account operations version and any invitation token. No trusted-device
exception is exposed. Inactive accounts fail; revocation invalidates pending
challenges. Successful completion stamps session `verifiedAt` and
`authenticationMethod`, then atomically finishes invitation grants if applicable.
Ordinary sign-in never creates service roles.

WebAuthn requires the configured public origin and hostname RP ID, resident
credentials and server-verified UV. Library verification callbacks reject a
cryptographically valid response without UV, including when a caller changes
browser options. Authentication challenge, signature, counter and origin/RP
validation remain library-owned. No password routes are available.

## Google and account linking

Both implicit and explicitly requested signup are disabled. Public input permits
only Google redirect OAuth; token-submission alternatives are rejected. State,
PKCE S256 and code exchange are Better Auth-owned. Callback destinations are
app-owned. Gmail or verified Workspace email can link an existing verified local
account automatically. An external-email Google account needs explicit linking
from a recently authenticated account with the same email. The explicit callback
also checks the initiating session ID and account version. Subsequent logins
identify the linked Google subject. Disconnect removes the stored association;
a subsequent authoritative-email Google login can link it again.

Credentials are optional, paired server-only `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` inputs with `_FILE` support. Tests mask both and use
synthetic token responses. Google console redirect registration and an interactive
provider acceptance check remain environment configuration, not a mocked-test
claim. See [local development](../runbooks/local-development.md#google-passkeys-and-authenticator-apps).

## Enrollment and recovery

Management requires active verified identity and completed authentication within
ten minutes. Up to ten named passkeys are allowed. TOTP setup stores encrypted
unverified credentials; it becomes active only after a valid six-digit code.
An active authenticator cannot be overwritten. The first passkey also creates
recovery codes. Passkey-only accounts keep a non-verified two-factor record for
recovery; it cannot authenticate with TOTP. Setup and recovery-code rotation
replace prior codes. Removing TOTP while passkeys remain preserves recovery codes.

Recovery is atomic and single-use under the shared authority lock. It leaves
factors enabled. There is no email-only protection reset. Removing the last factor
explicitly returns to ordinary email/Google sign-in; UI confirmation explains it.
Mutations revoke other sessions and pending challenges and record an audit event.
TOTP replay markers retain a keyed code fingerprint for 90 seconds. Better Auth
limits pending challenges to five failed attempts and applies its persisted
account factor lock; shared source and account management budgets also apply.

## Delivery boundary

`security-handler.ts` exposes only selected paths under `/api/v1/auth`:

- GET `methods`, `security/status`, `callback/google`.
- POST `sign-in/social`, `link-social`, `passkey/generate-authenticate-options`,
  `passkey/verify-authentication`, `two-factor/verify-totp`,
  `two-factor/verify-backup-code`.
- POST `security/passkey/options|verify|remove`, `security/totp/start|confirm|remove`,
  `security/recovery/rotate`, `security/google/remove`.

Inputs are bounded, strict and same-origin. Read-only method/status GETs use
the per-client read budget; OAuth callbacks and credential proofs use the auth
attempt budget. Native raw registration/enable/disable
routes are unavailable. App POST options map internally to the library's GET
options handlers. OAuth's state/PKCE-validated callback is the sole new
state-consuming GET exception; email codes and saved product actions remain POST.
The security transaction shares the product authority lock, with five-second
acquisition and twenty-second execution limits. OAuth provider latency holds this
lock; this deliberate small-installation compromise must be measured before scale.

Web forms forward only allowlisted auth cookies. Setup QR generation is local;
the encrypted setup cookie expires in five minutes and is account-bound. Completion
replays interrupted actions only for their recorded owner, using the completed
session. Public account/profile DTOs do not expose credential tables.

## Verification

`passwordless-security.e2e.spec.ts` covers the real transaction wrapper with a
synthetic Google exchange. Browser tests exercise Chromium virtual passkeys and
native TOTP/recovery forms with JavaScript disabled. Canonical verification also
covers existing invitation, account lifecycle, mutation and email flows. Provider
console setup and real authenticator hardware still require environment acceptance.
