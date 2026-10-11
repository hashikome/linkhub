# Passwordless account security

Status: implemented. Decisions: [ADR-0035](../engineering-decisions/0035-passwordless-account-security.md) and [ADR-0039](../engineering-decisions/0039-confirmed-google-account-creation.md).
Better Auth and `@better-auth/passkey` are pinned to 1.6.23 by the lockfile.

## Sign-in policy

| Primary method | Unprotected account | Passkey or TOTP enrolled |
| --- | --- | --- |
| Email code | Sign-in, or verified creation consent for a missing ordinary account | Pending factor, no usable session |
| Google | Sign-in or confirmed creation from verified Google identity | Pending factor, no usable session |
| Passkey | Registered credential required | Complete sign-in with server-verified user verification |

A pending login accepts enrolled TOTP, a registered passkey for the same user, or
one recovery code. TOTP/recovery alone cannot start a login. A signed ten-minute
factor cookie references Better Auth's challenge; encrypted app context binds
user ID, account operations version and any invitation token. No trusted-device
exception is exposed. Inactive accounts fail; revocation invalidates pending
challenges. Successful completion stamps session `verifiedAt` and
`authenticationMethod`, then atomically finishes invitation grants if applicable.
Ordinary sign-in never creates service roles.

All completed methods use `auth/complete-authentication.ts` after policy checks.
It stamps session assurance and last login, finishes any bound invitation, and
writes exactly one `security.sign_in.<method>` success (`email`, `google`, `passkey`,
`totp`, or `recovery`) with the same immutable actor and target user IDs.
The shared audit catalogue exposes each method in filters and searchable labels;
account security events display their target user. `code.verify` describes code
verification attempts, separately from completed sign-ins.
Registration uses the same completion as subsequent login. This work shares the
session/account transaction; audit failure rolls it back. Pending factors, staged
creation, proof-only recovery and session reads produce no sign-in success.
Credential enrollment can rotate a session but retains its previous assurance and
records a security-change event, not another login. See
[ADR-0046](../engineering-decisions/0046-shared-authentication-completion.md).

WebAuthn requires the configured public origin and hostname RP ID, resident
credentials and server-verified UV. Library verification callbacks reject a
cryptographically valid response without UV, including when a caller changes
browser options. Authentication challenge, signature, counter and origin/RP
validation remain library-owned. No password routes are available.

## Ordinary creation consent

Separate sign-in/signup entries share proof and a final creation screen (ADR-0044).
Email proof stages missing identities without creating users or sessions. A
browser-bound encrypted ten-minute proof is previewed at `/email-registration`
and consumed by `/email-registration/confirm` with confirm:true and optional hubName.
Consent checks continued account absence under the authority lock. A requested
hub shares the generated username as its initial handle and is created atomically.
Capture's explicit createAccount flag and invitation proof retain task-specific
onboarding; ordinary sign-in never infers creation consent from a correct code.

## Google and account linking

Provider-only implicit and requested signup are disabled. Public input permits
only Google redirect OAuth; state, PKCE and code exchange remain Better Auth-owned.
A verified authoritative Gmail/Workspace match links an existing account automatically.
Other existing verified accounts enter inline proof, with email or a registered
user-verified passkey. A missing account sees its email and two choices: Create
account, or Use a different email (Already have an account? Sign in from signup). The latter cancels pending state
and returns to ordinary sign-in with the destination intact.

Create account POSTs `{ confirm: true, hubName?: string }` to `/google-connection/register`. No
additional email code is needed: Google already supplied the verified identity.
For a missing account, the callback itself creates no user/session. The backend stores the validated
subject, email and name in an encrypted ten-minute browser-bound record. Under
the authority lock, registration requires a live new-account proof, absence of
that email and no existing Google subject association. Better Auth's adapter and
app-owned onboarding create a verified user (Google name, derived username),
then a session; the completion hook links, consumes proof, audits and sets
freshness in the same transaction. A missing name uses a neutral default.

Existing proofs bind UUID, email and operations version; new proofs bind provider
subject/email/name and the absence of an account. A racing email registration
requires restarting sign-in. Expiry, cancellation, replay, conflicting subjects,
forged input and rollback cannot create a partial user/session or attach to
another user. The API returns registration status only after validated OAuth,
never from a public email lookup. Existing sessions cannot substitute for proof.
New-account Google proofs cannot be completed by the email-code endpoints.

Gravatar continues through the backend avatar endpoint using the verified email,
with generated-icon fallback. It neither imports Google's photo nor makes
registration depend on an external image lookup.

Only completed authentication consumes the pending association and writes it
through Better Auth's account adapter, in the session/audit transaction. Enrolled
factors must pass first; email proof alone creates neither a connection nor a
usable session for a protected account. OTP resend/attempt limits remain shared.
Expiration, cancellation, replay and lifecycle/security revocation invalidate
pending connections. The web receives the known email and registration flag, never provider tokens
or subject. A second Google round-trip is unnecessary. Subsequent logins use the
linked Google subject, with a fresh same-email check. A mismatched Google email rolls back authentication and redirects to email sign-in. Optional explicit linking from a recently authenticated
account remains supported and binds the callback to its session and version.
Disconnect removes the association; a later Google sign-in repeats first-link
policy as needed.

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

- GET `methods`, `security/status`, `callback/google`, `google-connection`, `email-registration`
  (pending email and registration flag, never provider tokens or subject).
- POST `google-connection/register` (explicit creation from staged verified identity),
  `google-connection/cancel` (consumes pending association and clears its cookie).
- POST `sign-in/identify` (uniform email-entry response, no proof), `sign-in/social`, `link-social`, `passkey/generate-authenticate-options`,
  `passkey/verify-authentication`, `two-factor/verify-totp`,
  `two-factor/verify-backup-code`.
- POST `security/passkey/options|verify|remove`, `security/totp/start|confirm|remove`,
  `security/recovery/rotate`, `security/google/remove`.

Inputs are bounded and strict; browser mutations require the exact WEB_ORIGIN. Read-only method/status GETs use
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


## Backend callback and web destinations

BETTER_AUTH_URL addresses the backend. Google returns directly to
`/api/v1/auth/callback/google` there. WEB_ORIGIN addresses `/sign-in/complete`,
`/sign-in/factor`, settings and errors, and supplies WebAuthn's origin/RP ID.
Local development uses backend port 4004 and web port 3004 with exact-origin
credentialed CORS. Production ingress routes API paths directly to Nest.
The web never performs Google's token exchange. See ADR-0036 and the local
runbook for configuration and Google console registration.


### Restarting sign-in

Starting ordinary email entry (`/sign-in/identify`), email/confirmation code issuance
(`/code/send`), invitation acceptance/resend, or standalone passkey sign-in
(`/passkey/generate-authenticate-options`) cancels the browser's pending Google
association in the backend and clears its cookie after commit. Navigating away
from inline linking must not block signing into another account.

Inline Google email issuance/resends explicitly send `googleConnection: true`;
passkey factor continuation sends `continueSignIn: true`. These preserve the
pending association and all existing identity, expiry and factor checks. The
flags express flow intent and grant no identity authority. Verification still
rejects mismatched accounts, and rolled-back cancellation emits no cookie reset.


### Email-first passkeys

The initial screen offers email or Google. Email entry sends no code and reveals
no account or method existence; the next screen offers a passkey or a code to all
addresses. `/passkey/generate-authenticate-options` accepts optional `email` and
binds it with the current user UUID/version inside the library-owned challenge
record. Verification consumes that binding with the challenge and checks the
credential's authenticated user. Session cookies are excluded from option
generation so another signed-in account cannot constrain the credential picker.
No credential list is returned for the email. A signed challenge without matching
identity or with stale lifecycle version cannot authenticate.

An existing pending Google connection can request options with
`googleConnection: true`; the backend derives its email. A new-account pending
connection cannot use this alternative. Factor continuation remains
`continueSignIn: true`. The factor screen puts passkeys before TOTP/recovery;
email-only fallback cannot bypass enrolled protection.

First-link capture goes directly to email-code verification, as invitations do;
its entry does not offer Google or a standalone passkey. Enrolled second factors
still apply after email proof. Ordinary sign-in retains email/Google entry.
