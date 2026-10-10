# ADR-0044: Explicit authentication entry and optional signup hub

**Status:** accepted  
**Date:** 2026-10-10  
**Amends:** ADR-0004 email onboarding, ADR-0018 hub creation, ADR-0038 unified entry
and ADR-0039 creation presentation. Their credential, identity, same-email linking
and invitation boundaries remain accepted.

## Context

A single sign-in-or-create journey becomes ambiguous with Google: selecting the
wrong identity must not silently create an unwanted account. New people also need
an intentional way to start their own hub without first saving a resource.

## Decision

`/sign-in` and `/sign-up` express different intentions and share the authentication
implementation. Both use a roughly 400px column centered horizontally, above the
vertical midpoint: visible email label/input, full-width primary Continue with
email, quiet or separator, secondary Continue with Google. Sign-in reads Sign in
to nslinkhub and New here? Create an account. Signup reads Create your account and
Already have an account? Sign in. Subsequent steps keep the same column position.

Account existence is disclosed only after identity proof. An existing user signs
in with enrolled protection regardless of entry. A verified missing identity sees
its email and explicit Create account consent. Sign-in offers Use a different
email; signup offers Already have an account? Sign in. Neither email verification
nor a Google callback silently creates an account in these ordinary flows.
Creation reuses proof; it does not send another email code. Google association is
automatic, backend-owned and restricted to the product account's same email.

The shared creation screen offers Start with a hub, unchecked by default. Selecting
it requires a hub name. Creation is atomic with account/session creation; the
backend derives a username available in both namespaces and uses it as the initial
hub handle. Existing and retired hub handles are excluded. No hub is created when
this option is omitted. Person username and hub handle can subsequently diverge
under their existing policies; hub renames retain the 30-day cooldown and permanent
retirement rule. At most one hub per user remains invariant.

First-link capture and invitation acceptance keep their focused email-code flows
and explicit task intent. They do not detour through the ordinary signup screen.
Capture can pass explicit createAccount consent when verifying its code;
invitation verification keeps its independent proof and onboarding transaction.
Creation consent grants no service role. Validated return destinations survive
switching entry, switching email, creation, factors and cancellation.

## Backend mechanism

Better Auth still consumes OTPs atomically and enforces expiry/attempt limits.
For a missing ordinary email identity, signup is disabled in the scoped adapter;
after successful proof a random HttpOnly ten-minute cookie addresses an encrypted
verification record. The implementation depends on Better Auth 1.6.23 consuming
OTP before findUserByEmail; regression tests guard that ordering and invalid proof.
GET /email-registration previews only browser-bound proof. POST
/email-registration/confirm requires confirm:true, optional validated hubName and
continued account absence under the authority lock. It consumes proof and creates
the verified account/session through Better Auth and app-owned onboarding.
Cancellation and new independent authentication discard old creation proof.
Replay, expiry, a racing account or a failed transaction cannot produce a partial
account, hub or authenticated session. Google uses its existing equivalent proof.
The web owns presentation and sealed return/entry intent, never identity decisions.

## Consequences

Separate entry routes add clarity without duplicating credential workflows. A new
ordinary account has a deliberate final creation action, which also makes optional
hub setup available consistently for email and Google. Existing accounts keep
passkey/TOTP/recovery behavior. Capture and invitations keep their shorter journeys.
No schema migration or additional Google scopes are required.
