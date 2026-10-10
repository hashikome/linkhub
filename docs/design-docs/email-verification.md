# Email verification and interrupted actions

Status: implemented in the web. Settled in
[ADR-0010](../engineering-decisions/0010-one-verification-flow.md); security
rules and limits in [SECURITY.md](../SECURITY.md).

## Flow and interrupted actions

Sign-in and interrupted actions use one web flow with a purpose — `sign-in`,
`first-link`, `continue`, `resume`, `confirm`, `invitation` — that sets the
wording and what runs after the code (`apps/web/src/lib/verification.ts`). The
start screen sends nothing until the person chooses Send code; a known address
is shown, never asked for again. Sensitive operator actions answer
`recent_auth_required`, and the web asks the operator to confirm it's them.

An action interrupted by verification (a step-up, or any form action whose
session ended) is kept in a 15-minute encrypted HttpOnly cookie and replayed
once after the code, with the new session, then the person lands back where
they were with the result. It belongs to the account that started it (a keyed
fingerprint of the last signed-in email) and is discarded if anyone else signs
in. Rules and accepted limits: [SECURITY.md](../SECURITY.md).


## Explicit ordinary account creation

Sign-in/signup share proof screens but never silently create a missing ordinary
account. After valid email proof, the backend returns registrationRequired and
stages a short-lived browser-bound record. `/sign-up/confirm` shows the verified
email, explicit Create account and optional Start with a hub/name. The confirmation
creates the account and optional hub atomically; switching email cancels proof and
keeps the return destination. Existing accounts proceed with enrolled factors.
Capture supplies explicit creation consent and invitations retain independent
proof, so neither detours through this screen. See
[ADR-0044](../engineering-decisions/0044-explicit-auth-entry-and-optional-hub.md).

## Matching email purpose

The code email uses the same purpose as the send and verification screens.
Subjects, previews and body text describe sign-in, saving a first link,
continuing, session recovery, fresh confirmation or invitation acceptance.
Resends retain that purpose. For these sign-in purposes, purpose is presentation context only; proof
binding and authority checks stay backend-owned. Email-change templates are
retained but inactive: account email stays fixed (ADR-0041).

## Account lifecycle confirmation

Signed-in deactivation and deletion use action-specific send-code/enter-code
confirmation on `/account`. Signed-out recovery begins through ordinary email
sign-in: after correct proof, `/account` offers only the backend-selected
Reactivate account or Cancel deletion action. No public recovery selector is
shown; see [ADR-0040](../engineering-decisions/0040-contextual-account-recovery.md).
Here the action is an authorization boundary, not merely presentation: proofs
are bound to action/account/version and, for active-account actions, the session.
The sealed web flow ID also prevents a second tab from changing what an older
confirmation form authorizes. These codes neither resume ordinary mutations nor
leave an authenticated session behind. Recovery ends with a fresh sign-in. See
[auth delivery](auth-delivery-integration.md#self-service-account-actions) and
[ADR-0033](../engineering-decisions/0033-permanent-hub-handles-and-self-service-accounts.md).
