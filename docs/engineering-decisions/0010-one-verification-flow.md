# ADR-0010: One email-verification flow with purposes; actions resume for their owner

**Status:** accepted  
**Date:** 2026-10-07

## Context

Sign-in, first link, signing in to do something, an ended session, confirming a
sensitive action and invitations all send a code; separate screens drifted.

## Options considered

- Per-feature verification screens
- One flow; the purpose decides wording and what runs afterwards

## Decision

Every situation that needs an email code goes through one verification flow,
parameterized by its purpose, rather than per-feature screens. An action
interrupted by verification is kept and completed afterwards, once, and only
for the account it belongs to. Purposes, screens and limits:
[email-verification.md](../design-docs/email-verification.md) and
[SECURITY.md](../SECURITY.md).

## Rationale

- One place for verification UX and security.
- Nothing typed is lost to an expired session.

## Constraints to preserve

- A waiting action never replays for a different account.
- Nothing is emailed until the person chooses to send.

## Links

- [SECURITY.md](../SECURITY.md)
- [web-interface-system.md](../design-docs/web-interface-system.md)


## Email copy extension — 2026-10-09

The shared verification purpose also selects fixed email subject, preview and
body copy, preserved on resend. This keeps inbox wording consistent with the
screens. Ordinary code issuance accepts a bounded presentation purpose;
invitation purpose is selected from its backend workflow. Copy context never
changes proof namespaces, verification rules, authorization or action replay.
