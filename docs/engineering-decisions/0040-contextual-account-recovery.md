# ADR-0040: Recovery appears after verified sign-in

Status: accepted (2026-10-10). Refines the presentation and entry of ADR-0033;
deactivation, deletion cancellation, revocation and fresh-sign-in semantics remain.

## Decision

Ordinary sign-in and first-link capture do not advertise reactivation or deletion
cancellation. Anonymous email entry must not disclose account state. An eligible
self-deactivated account receives the ordinary-looking email code; successful
verification yields a short-lived recovery capability instead of a session.

The backend selects exactly one action from current state: Reactivate account
when self-deactivated without a deletion schedule, or Cancel deletion during the
unexpired grace period. The recovery screen names the state and reflects the
pending sign-in or saved-link task. A public visit to `/account` without proof
offers sign-in, not a menu of recovery actions. Signed-in account settings keep
their deactivation and deletion controls.

The discovery code binds action, user UUID, email and operations version. A
random HttpOnly ten-minute cookie references a hashed backend proof record with
the same binding. Preview and confirmation recheck eligibility and expiry. POST
confirmation accepts consent only; clients cannot select or change the action.
Mutation, proof revocation and audit commit atomically. Temporary Better Auth
proof sessions are removed and never exposed to the browser.

Cancellation retains the existing rule: deletion stops but the account remains
inactive. Reactivation is a separate explicit action. Neither recovery action
restores old sessions/grants or removes enrolled factors or operator restrictions.
A fresh sign-in follows, preserving the saved destination. New accounts and
active accounts continue through normal authentication.

## Validation

API coverage includes anonymous equivalence, incorrect proof, consent forgery,
expiry, account-version/state changes, replay, rollback, and ineligible accounts.
Browser coverage checks one-action screens and capture destination preservation
with and without JavaScript.
