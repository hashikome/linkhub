# Auth-delivery integration

Status: implemented and locally verified. Dependency pinned by `bun.lock`:
better-auth **1.6.23**. Email codes support signup and sign-in. Account email is fixed (ADR-0041).
Passkeys, Google sign-in and confirmed account creation and optional TOTP/recovery are implemented;
see [passwordless security](passwordless-security.md). Controlled email change is backlog; targeted collection invitations remain planned.

## Ownership and transaction boundary

`create-auth.ts` composes better-auth; `delivery-auth.ts` supplies its Prisma
adapter and app-owned signup hooks with the request's transaction client. The library
mints, hashes and consumes OTPs, writes credentials, creates sessions and
revokes them. No parallel proof store or custom OTP comparison exists.

Every mutating auth request takes PostgreSQL transaction advisory lock
`74201931`. This serializes authenticated product mutations, auth writes and
operator commands across replicas, including code session creation, resend and
account recovery. Read-only product requests remain concurrent; see
[RELIABILITY.md](../RELIABILITY.md). This is a deliberate small-installation throughput tradeoff: measure
lock wait before replacing it with carefully ordered account/challenge locks.
Transaction acquisition is bounded to 5 seconds. Email execution is bounded to
15 seconds, security operations to 20 seconds. OAuth exchanges the authorization
code with Google inside the security transaction; email delivery stays outside
it. This retains atomic linking/session policy at the cost of holding the shared
lock during that exchange; monitor latency before changing the locking model.

The OTP delivery callback renders an approved template and persists an
AES-256-GCM-encrypted outbox payload in that same transaction. Its key is
domain-separated from the auth secret. An outer failure flag and expected
callback count detect better-auth's swallowed callback errors, so a failed
persistence operation cannot report success. HTTP 5xx rolls back; invalid proof
responses commit attempt consumption. Responses are returned only after commit.

Successful authentication is finalized only by `auth/complete-authentication.ts`,
through the shared security policy hook. Email delivery never separately stamps
the session or writes a success for code verification. It records code issuance
and rejected verification as delivery evidence; `security.sign_in.email` is the
account-bound success for ordinary email, explicit registration, capture and
invitation sign-in. Google and factors use the same completion with their method.
Proof-only recovery/lifecycle actions keep their dedicated audit events.
`modules/users/signup-onboarding.ts` owns generated identity and optional-hub
orchestration; Better Auth user hooks only call its preparation/completion phases.
See [ADR-0046](../engineering-decisions/0046-shared-authentication-completion.md).

`auth-delivery.e2e.spec.ts` proves the production wrapper, including
separate-process consumption, rollback and rejection of retired email-change routes.
Library integration limitations and the wrapper's original proof are preserved
in the [completed integration plan](../exec-plans/completed/prove-auth-delivery-boundary.md).

Email-change issuance and confirmation are retired. The old intent schema and
identifier helper remain only for revoking historical proofs and normal cleanup;
no public route can start or consume them. See
[ADR-0041](../engineering-decisions/0041-fixed-account-email.md).

## Public HTTP contract

All paths below are under `/api/v1/auth`, use JSON POST and return no-store
responses. Eight-digit codes expire after five minutes and allow three wrong
attempts. Resend rotates proof. Shared PostgreSQL budgets allow five issues and
15 verification attempts per identity per ten minutes; the existing source
budget also applies (30 auth requests/minute). Budget keys are purpose-bound
HMACs, never raw addresses. Delivery failures return 503; budget rejection 429;
invalid proof 400 or exhausted proof 403. Cookie requests require the configured
origin; cross-site requests are rejected independently of library test defaults.

The composition root explicitly disables better-auth's native HTTP rate limiter
in every environment. Its production-only, in-memory OTP default (three requests
per minute per IP/path) conflicts with the shared budgets above. `configureApp`
mounts the PostgreSQL source budget before every auth route; `delivery-auth`
enforces identity budgets, while better-auth retains the three-wrong-attempt
limit for each proof. A fresh `NODE_ENV=production` child process exercises the
configured HTTP stack, including distinct-address issuance, resends, actual
sign-in, the identity verification ceiling and the source ceiling despite
spoofed forwarding headers.

| Path | Body | Success |
| --- | --- | --- |
| `/code/send` | `{ email, purpose?, googleConnection? }` | `{ success: true }`; same shape for new/existing/suppressed addresses |
| `/code/verify` | `{ email, code, name?, createAccount? }` | Completed sign-in returns the better-auth token/user response and session cookie/bearer header; pending creation consent, factor or account recovery returns its workflow response without a usable session |

Ordinary code issuance cancels abandoned Google and email-creation state. Only the inline
Google continuation sets `googleConnection: true`, preserving its identity-bound
proof. Verification can return `twoFactorRedirect: true` for an enrolled factor
or `accountRecovery: true` for contextual recovery. Unknown ordinary identities return
`registrationRequired: true`; explicit confirmation at `/email-registration/confirm`
creates from browser-bound proof with optional `hubName`. Only explicit task
consent (`createAccount: true`, used by capture) creates directly at verification. Clients continue the indicated
workflow rather than treating successful email proof as a completed sign-in. See
[passwordless security](passwordless-security.md) and the contextual recovery
contract below.

GET never consumes email proof; Google's state/PKCE-validated callback is the documented OAuth exception. Native
OTP, verification, magic-link and password-reset HTTP paths are unavailable so
they cannot bypass the delivery or workflow boundary. The explicit native
allowlist preserves sign-out and session revocation. Native user updates and
email-change routes are unavailable; profile edits use the product endpoint.
Password signup/sign-in/enrollment/change/reset are unavailable, and better-auth
email/password authentication is disabled. No password migration or compatibility
workflow is needed: the product has not been deployed. The vendor adapter's
account schema stays intact but no password credential is created by code signup.
Mailbox verification and the library's unproven-account protection stay enabled.

The optional `name` on code verification is a trimmed, nonempty display name
(up to 255 characters), used only at first account creation. Existing users'
profiles are unchanged by sign-in. `PATCH /profile` accepts the account's full
name (`displayName`), `username` and optional public `bio` (plain text,
at most 500 characters; blank clears it, omission preserves it). When a hub exists, it also accepts
its name (`hubName`), handle, description (`hubDescription`) and `showOwner`.
`showOwner` belongs only to the Hub model; the settings response returns null
for this field when no hub exists. Profile edits
never create a hub or edit credentials.
Hub handles are editable under ADR-0043. Renames
require 30 days between successful changes; retired spellings cannot be reused
by anyone. The backend returns `handleChangeAvailableAt` during cooldown, and
clients cannot write change timestamps. SQL enforces cadence and retirement.
Shared UUID links survive.
Usernames remain editable. Profile PATCH rejects user UUID and email, including
mixed requests containing valid fields; profile PUT is unsupported. Account email
stays fixed. Any future email change requires a dedicated POST action after its
proof, notification and identity-continuity policy is settled.

## Self-service account actions

`POST /api/v1/auth/account/send` and `/account/confirm` accept the explicit
actions `deactivate`, `delete`, `reactivate` and `cancel_deletion`. Deactivation
and deletion require the initiating session and use its account email; recovery
requires a signed-out caller and an eligible self-deactivated account. Ineligible
recovery issuance returns the same generic response without sending a code.

Codes use better-auth primitives with a separate action/account/version-bound
namespace, also bound to the initiating session for active-account actions.
Ordinary sign-in and invitation codes cannot authorize these commands. Wrong
attempts commit; successful proof consumption, revocation, state update and audit
commit atomically. Temporary verification sessions are revoked and never returned.
The web binds confirmation forms to their sealed flow ID and action to reject
forms superseded in another tab. Generic vendor deletion remains unavailable.

Deactivation is reversible without a cleanup deadline. Deletion has a 14-day
grace period; cancellation before expiry leaves the account inactive. Recovery
never lifts operator restrictions or restores revoked privileges. Administrators
must relinquish their service role before using these actions. See
[ADR-0033](../engineering-decisions/0033-permanent-hub-handles-and-self-service-accounts.md).

## Delivery and privacy

PostgreSQL owns delivery truth. BullMQ jobs contain only `{ id }`, with an
`email-v1` name and a configured namespace. The separate API-image worker
periodically republishes eligible intents, so Redis loss does not lose mail.
An atomic database claim, random fencing token and 30-second lease prevent
concurrent sends. Provider requests time out after five seconds; retries use
one immutable rendered payload and opaque idempotency key. Five failures are
terminal. A failure recording success leaves the lease for recovery with the
same key; no new message is created. Resend's deduplication window is
[24 hours](https://resend.com/changelog/idempotency-keys/); code delivery stops
at five-minute expiry, and exactly-once external delivery is not claimed.

Credentials are encrypted at rest in pending delivery rows, erased on terminal
outcomes or superseding issuance, and swept after expiry once a live claim ends.
Rotating the auth secret also makes outstanding encrypted mail unreadable; it
fails closed and users request fresh codes. Delivery/webhook metadata lasts
30 days, auth audit 90 days. Expired workflow intents and proof/budget rows are
swept. Suppression HMACs remain until operator review; no raw recipient is kept
in suppression or delivery metadata. Recipient HMACs use a separate stable
`EMAIL_SUPPRESSION_SECRET` (at least 32 characters; `_FILE` supported), required
in production. Keep it unchanged during auth-secret rotation and restore it with
database backups. Changing it requires an operator-reviewed rekey/import of
suppression records; never silently discard existing suppressions. In-flight mail can arrive after resend,
but only the latest proof remains valid. Capture is memory-only, bounded to
100 messages, available to injected tests and never logged or exposed over HTTP.

The raw-body `/api/v1/webhooks/resend` route verifies Svix signatures and a
five-minute timestamp window before parsing events. Event IDs deduplicate;
complaint/suppression/bounce outcomes cannot regress when events arrive out of
order. Resend requests carry a `delivery_id` tag containing only the opaque
outbox UUID, independent of user/hub identities. Signed events echo it in
[`data.tags`](https://github.com/resend/resend-openapi/blob/main/resend.yaml).
This correlates a receipt even after code expiry erased the encrypted payload,
within the 30-day metadata retention window. Receipt recording and suppression
commit together. A signed early receipt stops pending retries and fences the
worker; expired/cancelled rows retain their terminal state. Conflicting provider
IDs, unattempted deliveries and unknown references are never acknowledged as
handled. Events without tags fall back to a known provider ID; unknown IDs
return 503 for retry. Supported events are sent, delivered, delivery_delayed, failed,
bounced, suppressed and complained. Only minimal outcome metadata survives.

## Local and deployment status

Local tests force capture delivery and isolated queue namespaces. Source and
browser acceptance cover code sign-in, verification and contextual recovery.
Identity-update rejection has API acceptance. Live provider/domain/webhook acceptance
remains a release prerequisite. Local configuration is private and provides no
release evidence.

See [transactional email](transactional-email.md) for policy,
[local development](../runbooks/local-development.md) for setup, and the
[release runbook](../runbooks/release.md) for outstanding live proof.


Code-send purpose is optional presentation context: sign-in (default), first-link,
continue, resume or confirm. Only fixed copy is selected; purpose changes no code
namespace, authorization, session or freshness rule. Unknown values are rejected.
Invitation emails derive their purpose from the validated invitation workflow,
never from an ordinary code-send request. Web forms derive purpose before
sending and retain it in sealed resend state. No free-form action, collection
title, URL or role details are accepted as email copy.

### Contextual recovery from email sign-in

Eligible self-deactivated accounts receive a normal-looking code from `/code/send`.
The proof uses a separate action/account/version-bound identifier. Correct
`/code/verify` returns `{ accountRecovery: true }` and an HttpOnly recovery cookie,
never a session or bearer token. GET `/account/recovery` then returns only the
eligible action and verified email. POST `/account/recovery/confirm` accepts
`{ confirm: true }`; the backend rechecks state/version/expiry, uses the existing
lifecycle mutation and revokes proof atomically. New restrictions or an expired
deletion deadline invalidate recovery. See ADR-0040. Active-account and invitation
verification retain their existing behavior and factor requirements.
The account page checks recovery independently of session resolution. A verified
recovery action takes precedence even when the browser retains another account's
session; completing recovery does not switch that session or mutate its account.
