# ADR-0004: Passwordless sign-in with email codes; better-auth owns credentials

**Status:** accepted  
**Date:** 2026-10-07

The email method and auth boundary remain accepted.
[ADR-0035](0035-passwordless-account-security.md) adds passkeys, Google and
optional TOTP/recovery; [ADR-0039](0039-confirmed-google-account-creation.md)
permits confirmed account creation from verified Google identity.

[ADR-0044](0044-explicit-auth-entry-and-optional-hub.md) supersedes the unified
entry and implicit ordinary email creation policy, adds a shared verified creation
screen and permits an optional named hub during signup. Other decisions remain
accepted unless already marked superseded.

[ADR-0057](0057-default-email-code-length.md) supersedes only the eight-digit
length below: email codes now use Better Auth’s six-digit default. All other
authentication and proof-boundary decisions remain accepted.

## Context

Passwords add reset flows, breach exposure and support load for a product that
already relies on email.

## Options considered

- Passwords + email verification
- Magic links
- Eight-digit email codes

## Decision

Sign-in is an eight-digit email code. better-auth owns credentials, sessions and
verification primitives; the product owns identity, onboarding and
authorization. Session resolution goes through `resolveSessionUser`; services
see `AuthUser`, never better-auth types. Sign-up onboarding lives in an
app-owned service callable from any auth path.

## Rationale

- No passwords to store or reset.
- Codes work across devices (a magic link opens wherever the mail is read).
- The future ns-series SSO can call the same onboarding service.

## Constraints to preserve

- Codes are plain digits, single-use, short-lived, attempt-limited and resend-throttled.
- The better-auth handler is mounted before body parsers.

## Links

- [auth-delivery-integration.md](../design-docs/auth-delivery-integration.md)
- [identity-sso.md](../design-docs/identity-sso.md)
