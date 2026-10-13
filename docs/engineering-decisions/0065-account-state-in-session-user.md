# ADR-0065: Account state loaded with the session user

Status: Accepted
Date: 2026-10-13

## Context

Every signed-in API request resolved its session with better-auth (session row,
user row) and then read `users.account_state` again in a separate query, because
better-auth only returns user fields it knows. Deactivation already deletes all
sessions in the same transaction (`revokeAccountAccess`); the per-request check is
a backstop for any path that changes account state without revoking sessions.

## Options Considered

- Keep the extra query: correct, one database round trip per signed-in request.
- Drop the check and rely on session revocation alone: removes the backstop.
- Declare `accountState` as a better-auth additional user field: selected. This
  mirrors better-auth's own admin plugin, which adds ban state to the user model.

## Decision

`accountState` is a better-auth `additionalFields` entry with `input: false`, so it
arrives on the user row getSession already reads and no client can set it. The
delivery-auth `getSession` wrapper admits a session only when that value is
`active`; a missing or renamed field fails closed (no session). Session
`cookieCache` must stay disabled: it would serve account state from the cookie.

## Consequences

One fewer query on every signed-in request. better-auth responses that include the
user (for example `get-session`) now show the caller's own `accountState`.
Renaming the Prisma field requires the same change in `create-auth.ts`; the
inactive-session regression test in `hub-tenancy.e2e.spec.ts` fails otherwise.
Product services still consume `AuthUser`, never better-auth types.
