# ADR-0035: Passwordless sign-in and protected recovery

Status: accepted (2026-10-10).

First-link UX amended by [ADR-0037](0037-inline-google-connection.md): any
additional ownership proof happens inside sign-in; Settings is not required.

Google onboarding and entry presentation are amended by
[ADR-0038](0038-email-owned-google-onboarding.md) and
[ADR-0039](0039-confirmed-google-account-creation.md). The current policy permits
explicitly confirmed new-account creation from verified Google identity without
another inbox code. Existing-account first proof can use email or a registered
passkey. The original decision below explains the earlier restriction; consult
[passwordless security](../design-docs/passwordless-security.md) for the current contract.

## Context

Email codes avoid passwords but combining them with authenticator codes adds
friction. The user chose passkeys as the preferred option, Google for existing
accounts, optional TOTP and recovery that cannot bypass enrolled protection.

## Decision

A passkey requires server-verified WebAuthn user verification (device PIN or
biometric) and completes authentication without an additional TOTP code.
Google replaces email entry/verification for an existing account; it never
registers a product user. Email-code onboarding remains app-owned.

An account with TOTP or a passkey requires protected authentication: email and
Google must be followed by enrolled TOTP, a registered passkey, or a single-use
recovery code. TOTP alone is not a primary login method. Recovery codes do not
remove factors. No trusted-device exception is introduced.

Google links through a verified, authoritative email match (Gmail or verified
Workspace) or an explicit recently authenticated linking step proving the same
account email. A Google account's external email claim alone is insufficient.
Subsequent logins use the immutable provider subject, never email as a foreign
key. OAuth signup is disabled even when explicitly requested by a caller.

Security enrollment/removal and recovery-code rotation require recent completed
authentication. TOTP becomes active only after a valid setup code; enrollment
cannot overwrite an active authenticator. Removing the last protection is an
explicit security action. Changes revoke other sessions and pending challenges.
No email-only support reset removes protection. Users must retain another
passkey, an authenticator, or offline recovery codes.

Better Auth owns cryptographic credentials, verification and sessions; the app
owns method policy, account eligibility, proof-bound workflow completion and
audit. Password and unsafe alternative endpoints remain unavailable. An email
proof pending a factor never grants a session or an operator role. Account
reactivation/cancellation preserves factors and requires a fresh protected login.

This amends the delivery order in the accepted nsauth direction: ship local
methods now, behind the existing authentication boundary. The future separate
identity service still owns shared credentials/MFA/recovery, while NSLinkHub
retains immutable local identities and all domain authorization.

## Consequences

WebAuthn requires a supporting browser and HTTPS outside localhost. Google
requires configured callback URLs. Recovery codes must be kept outside the
account; losing every enrolled method and recovery code can prevent recovery.
Credentials remain server-only with `_FILE` support, never in builds or logs.
The method policy must be tested at the raw HTTP boundary and across process
boundaries, rather than inferred from UI or plugin configuration.
