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


## Matching email purpose

The code email uses the same purpose as the send and verification screens.
Subjects, previews and body text describe sign-in, saving a first link,
continuing, session recovery, fresh confirmation or invitation acceptance.
Resends retain that purpose. For these sign-in purposes, purpose is presentation context only; proof
binding and authority checks stay backend-owned. Email-change confirmation and
new-address verification retain their separate templates.

## Account lifecycle confirmation

Deactivation, deletion, reactivation and deletion cancellation use the same
send-code/enter-code interaction on `/account`, with action-specific email copy.
Here the action is an authorization boundary, not merely presentation: proofs
are bound to action/account/version and, for active-account actions, the session.
The sealed web flow ID also prevents a second tab from changing what an older
confirmation form authorizes. These codes neither resume ordinary mutations nor
leave an authenticated session behind. Recovery ends with a fresh sign-in. See
[auth delivery](auth-delivery-integration.md#self-service-account-actions) and
[ADR-0033](../engineering-decisions/0033-permanent-hub-handles-and-self-service-accounts.md).
