# ADR-0039: Confirmed account creation from Google identity

Status: accepted (2026-10-10). Supersedes ADR-0038's requirement for an additional
email code when creating a missing account after Google authentication. Explicit
creation consent, same-email enforcement, passkey policy, invitation isolation
and backend ownership remain binding.

[ADR-0044](0044-explicit-auth-entry-and-optional-hub.md) supersedes the unified
entry and implicit ordinary email creation policy, adds a shared verified creation
screen and permits an optional named hub during signup. Other decisions remain
accepted unless already marked superseded.

## Context

Google supplies an authenticated identity, verified email and profile name.
Asking a new user for another inbox code repeats the identity step. The product
owner chose to trust the verified provider identity for creation while retaining
the explicit choice that prevents accidentally creating an unwanted account.

## Decision

Normal sign-in offers email or Google. After validated Google authentication, a
missing account sees its email and exactly two choices: Create account, or
Already have an account? Sign in. Google callback alone creates nothing. Create
account confirms registration without another email code or provider round trip.
The alternative cancels pending Google state and returns to ordinary sign-in,
preserving the destination. Capture and invitations still use email codes directly.

The backend stages the verified Google subject, email and name in an encrypted,
ten-minute browser-bound record. POST `/api/v1/auth/google-connection/register`
accepts only `{ confirm: true }`. Within the authority transaction, it requires
a live pending new-account proof, no current account with that email and no
existing association for the Google subject. Better Auth creates the verified
user and session through the app-owned username/onboarding hook. The completion
hook connects the subject, consumes proof, audits sign-in and stamps freshness
atomically. Email/name/subject supplied by a client are never accepted.

The Google name initializes the full name (bounded to 255 characters); a missing
name uses a neutral default. Existing accounts are never renamed by sign-in.
The current backend avatar endpoint resolves Gravatar using the verified account
email and falls back to its generated icon. Google photos are not imported, and
Gravatar network availability does not block account creation.

Provider-only implicit/requested signup remains disabled in Better Auth; only
the app's consent endpoint may create from the staged identity. Email-code
continuation cannot consume a new-account Google proof. Cancellation, expiry,
replay, concurrent email registration, subject conflicts and transaction failure
cannot leave a partial user, association or session.

## Consequences

Google's verified claim is accepted for a genuinely new account. Attaching a
provider identity to an existing account retains the stricter first-proof policy:
authoritative Gmail/Workspace can connect automatically, while other addresses
require the existing email/passkey proof. This prevents an old external-email
Google claim from taking over an existing account. Subsequent Google sign-in
still requires the same email and any enrolled factor.

This differs from Pigfarm's closed invitation-only registration. Its automatic
same-email association remains the reference for keeping linking out of the user
journey. No additional Google service scopes or access are introduced.

Reference: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).
