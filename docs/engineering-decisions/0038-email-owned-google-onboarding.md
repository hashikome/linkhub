# ADR-0038: Email-owned onboarding within Google sign-in

Status: accepted (2026-10-10). New-account email-code requirement superseded by
[ADR-0039](0039-confirmed-google-account-creation.md). Supersedes the existing-account-only Google
restriction in [ADR-0035](0035-passwordless-account-security.md) and
[ADR-0037](0037-inline-google-connection.md). Their backend ownership, cryptographic
verification, transactional linking and protected recovery rules remain binding.

The original email-code creation mechanism below is historical. Current Google
creation uses explicit consent and verified provider identity; other entry and
invitation-isolation decisions remain accepted.

[ADR-0044](0044-explicit-auth-entry-and-optional-hub.md) supersedes the unified
entry and implicit ordinary email creation policy, adds a shared verified creation
screen and permits an optional named hub during signup. Other decisions remain
accepted unless already marked superseded.

## Context

Google is sign-in convenience. Requiring a person whose email has no product
account to abandon Google, register separately and restart linking is unnecessary.
Silently creating an account after Google consent is also unwanted: someone may
have picked the wrong Google account while trying to sign in.

## Decision

The ordinary sign-in screen offers Continue with email and Continue with Google.
Saving a first link goes directly through the shared email-code screens, preserving
the pending link. This amends the earlier choice to offer Google/passkeys in capture:
the product owner chose a direct email path, like invitations, to reduce choices.

Provider-only signup remains disabled. After validated Google OAuth, a missing
account enters the existing inline email-code flow with an explicit creation
screen. It shows the email and says no account exists for it. Offer exactly two
choices: Create account (sends the verification code), or Already have an account?
Sign in (clears the pending association and returns to email/Google sign-in with
the destination preserved). The code screen says Verify and create account. Merely choosing Google,
viewing this screen or sending a code creates no account. A correct emailed code
creates and verifies the product account and saves the Google association in one
transaction, through the ordinary email onboarding service and Better Auth.

Existing accounts retain automatic authoritative-email linking or inline first
proof. A registered, user-verified passkey can provide that first proof instead
of email. It completes authentication without another TOTP/email code. A new
Google identity cannot use a passkey to bypass mandatory registration email proof.

Email entry reveals no account existence or enrolled methods. The continuation
offers a passkey for users who already have one, and an email-code alternative.
The backend binds the WebAuthn challenge to the selected email, immutable user ID
and operations version, rejecting another account's credential. No credential IDs
are returned based on an unverified email lookup. TOTP/recovery still cannot start
a login; email/Google fallback still requires enrolled protection.

Invitations always retain their separate invitation email proof and consent.
Starting or resuming invitation verification, ordinary email entry, standalone
passkey authentication or confirmation code issuance discards abandoned Google
linking state. All form transports forward its committed cookie deletion.

## Consequences

Pending Google proof can reference an existing verified user, or an email with no
account. The latter can be consumed only by successful native email verification
in a transaction that established the account was absent under the authority
lock. If another flow created the account in between, restart sign-in; do not
silently attach the pending identity to it. Expiry, cancellation, replay,
revocation, subject conflicts and rollback retain their fail-closed behavior.

No schema or credential changes. Browser coverage includes explicit creation and
cancellation without JavaScript, existing-account linking, email-first WebAuthn,
wrong-account credential rejection, first-link capture, confirmation and invitations.

Google's verified email must equal the product account email on every sign-in,
including after linking. Mismatches roll back authentication and redirect to
Continue with email. Product copy speaks of creating an account or signing in;
linking is an internal implementation detail, not onboarding language.
