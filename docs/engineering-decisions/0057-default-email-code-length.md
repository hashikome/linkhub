# ADR-0057: Use Better Auth's default email code length

Status: Accepted
Date: 2026-10-12

## Context

ADR-0004 chose eight-digit email codes without a specific rationale for eight
over six. Product review favors shorter manual entry. The pinned Better Auth
1.6.23 email-OTP plugin generates six digits when `otpLength` is omitted.

## Decision

Supersede only the eight-digit length in
[ADR-0004](0004-passwordless-email-codes.md). Remove the `otpLength` override and
use Better Auth's default. API and web validation accept exactly six digits;
the shared web entry continues to normalize pasted spaces and hyphens. Update
UI copy and generated-email test helpers accordingly. Authenticator-app codes
and recovery codes retain their existing contracts.

Keep all other safeguards: five-minute expiry, single-use proofs, three wrong
attempts per proof, resend rotation and cooldown, five issues and fifteen
verification attempts per identity per ten minutes, and shared source budgets.
Replacing a code does not reset the identity verification budget. Better Auth
continues to own generation, hashing, comparison and consumption.

## Consequences

Six digits reduce typing and the random-guess space from 100 million to one
million possibilities. This usability tradeoff relies on retaining and testing
the existing attempt limits; it is not an equivalent amount of guessing resistance.
Integration tests assert six-digit generation and budget persistence across
resends so dependency upgrades cannot silently diverge from the input contract.

There is no migration. Previously issued eight-digit codes require a new code
after the normal cooldown. This is a pre-deployment change; no compatibility
window is introduced and existing sessions are unaffected.
