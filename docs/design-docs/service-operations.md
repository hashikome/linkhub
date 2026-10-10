# Service operations

Status: admin/operator invitations, account restrictions, distribution holds,
audit and the `/manage` web console are implemented and locally verified. The
console is part of the shared
[Manage workspace](manage-workspace.md), with separate owner/service authority. See the
[operator runbook](../runbooks/service-operations.md) for procedures.

The current audit implementation is provisional. Its redesign and a complete
audit strategy are deferred until fundamental operations are complete
([ADR-0020](../engineering-decisions/0020-logging-after-core-operations.md)).
Existing recording, transaction guarantees and access boundaries below remain
the interim contract; current feature work does not include further audit UI
iteration or general change-payload capture.

[ADR-0021](../engineering-decisions/0021-bounded-audit-effects.md)
authorizes a bounded interim capture/presentation slice. Manage shows recorded
states, outcomes and reasons, with current actor usernames alongside stable IDs.
Invitation targets use invitation IDs, not recipient IDs. Session revocations do
not present account state as the session change; counts were not recorded.
`view=actions` excludes successful routine reads before pagination but retains
denials; `view=all` includes reads. The API default remains all. An explicit read
action normalizes the view to all, and effective filters bind the cursor.
Dates use the viewer's local `YYYY-MM-DD HH:mm:ss`, with a labelled UTC fallback
without JavaScript.

Unified web search uses `q` to match displayed actor usernames/IDs, action labels,
target IDs, outcomes and recorded changes within the authorized feed. It accepts
partial IDs and requires all search words to match, case-insensitively. Search
runs before pagination; the query binds the cursor. Explicit API actor/target/hub
filters remain supported. Date filters use local day boundaries with JavaScript
and labelled UTC without it.

This is the product-owned service-operator contract. It adds account operations
and public-content moderation to the individual hub model; it does not add hub
memberships, private-content access, or a new identity provider. The
[tenancy and access](tenancy-and-access.md) and [product definition](../../PRODUCT.md)
remain authoritative. New operator capabilities must include their complete verified journey before
appearing in navigation.

## Capabilities

An explicitly authorized operator can find an account, deactivate, suspend or
reactivate it, revoke its sessions, place or release a publication hold, and
review the recorded operations. Admins may also schedule or cancel deletion of
non-admin accounts. Two product capabilities apply: `service_admin` manages users
and operator invitations/access, while `service_operator` performs account and
moderation work. Neither confers private-content access. There is no configurable
permission builder. Operators cannot restrict another operator or admin account;
admins manage operator accounts. Admin account suspension is unavailable.

| Operation | Information and authority | Boundary |
| --- | --- | --- |
| Find accounts | Paginated account table searchable by exact user ID or username, email and hub handle fragments (`GET /operations/accounts?q=`); name, email/verification, immutable user/hub IDs, handle, creation date, account status and session count; permitted actions are on account detail | Email is operational personal data; no bulk export, secrets, private collection titles or browsing history; the search text is not written to the audit |
| Suspend/reactivate | Change account availability with a required reason; suspension revokes all sessions and operator access | No ownership reassignment or credential editing; admin deletion follows ADR-0023 |
| Revoke sessions | End all cookie and bearer sessions for the target account | Does not suspend it; a fresh sign-in is allowed |
| Hold/release publication | Find a collection by ID or pasted link through `GET /manage/collections?q=`; restrict distribution of a currently public collection; inspect/release held rows without exposing private titles | Does not confer permission to read or edit its content |
| Review operator audit | Cursor-paginated table with one Search field for displayed row content, Action and From/To dates; rows show current usernames alongside IDs and recorded effects/results | No generic database browser or access to other users' hub audit feeds |

Use ordinary public collection reads to inspect reported public material.
Once the owner unpublishes it or a hold hides it, operators retain only the
minimal enforcement record (IDs, status, reason and timestamps). No content
snapshot, private preview, export bypass or impersonation is created. A
collection already readable through an operator's ordinary personal share
remains governed by that share, not their operator capability.

User reporting forms, appeals/case management, bulk actions, arbitrary profile
editing, account takeover, automated moderation, identity-provider migration
and hosting/email-provider consoles remain outside these operations. Local
passkeys/TOTP and protected recovery follow [passwordless security](passwordless-security.md);
service permissions remain product-owned. Suspension is per existing user ID; it is not a promise to prevent a
person from registering a different account.

## Sharing analytics

Operators and admins can read service-wide aggregate counts through
`/api/v1/share/analytics?scope=service`. Manage's Analytics tab precedes Audit Log
and shows all-time totals plus resource/destination breakdowns with manual Refresh.
Admins can additionally read individual service-wide share metadata through
`/api/v1/share` with `scope=service`, under the same audited cookie authority.
Authored messages, arbitrary creator context and resource content are excluded; IDs,
creation dates and reported-open counts support operational analysis.
See [sharing](sharing.md) for creator and resource-owner API scopes.

## Admin bootstrap and accepted invitations

Grants are keyed by immutable user IDs and are site-wide, separate from the per-collection roles ([roles and labels](tenancy-and-access.md#roles-and-labels)).
Only an active admin with a cookie session verified within five minutes may
invite operators, resend/cancel invitations or revoke operator access. There
is no direct operator grant command or HTTP action. Multiple operators may
serve concurrently; removing the last operator is allowed because admin
management remains available. An operator cannot appoint another operator.

At startup, an explicitly configured `BOOTSTRAP_ADMIN_EMAIL` records one admin
invitation, encrypted delivery and audit. It creates **no user, hub or grant**.
The email contains a random 256-bit token in the fragment of
`/invitations/accept#token=...`; only its digest is stored on the invitation.
GET and preview consume nothing. Repeat startup neither duplicates mail nor
restores revoked authority. Changing the configured address does not replace
an existing bootstrap invitation; recovery is an explicit operator command.

Both roles use the same email-entry journey, adapted from Pigfarm ADR-0012:

- A new recipient enters their name and explicitly accepts. In one transaction,
  better-auth's adapter creates the unverified account, the app-owned onboarding
  hook assigns its username without creating a hub, and consent plus email-code delivery are recorded.
- Existing recipients accept without entering a name. Existing names are never
  overwritten. A different signed-in account must sign out first.
- Every recipient, including a matching signed-in account, verifies a fresh email
  OTP. Consent puts the invitation in `verifying`; no role exists yet. Successful
  verification atomically creates the role, session and audit, completes the
  invitation, and redirects to `/manage`. For protected accounts, the fresh
  invitation-bound email code yields a pending challenge; only completed
  TOTP/passkey/recovery proof grants the role and session. Ordinary Google or
  passkey sign-in never substitutes for the invitation-bound email proof.

Issuance, preview, expiry, cancellation, decline and abandonment before consent
create no accounts. A forwarded token can record consent and create an unverified
account, but cannot establish a session or role: the code goes only to the invited
address. Codes are purpose-bound to the invitation and its version; ordinary
login codes cannot activate invitations, and invitation codes cannot log in
through the ordinary endpoint. Account invitation listings show status and direct
recipients back to their email; IDs alone never authorize acceptance.
With JavaScript disabled, recipients paste the emailed link into the native entry
form. With JavaScript, its fragment is exchanged for an encrypted HttpOnly flow
cookie and removed from browser history; raw tokens never enter HTTP URLs/logs.

Tokens expire after seven days. Resend rotates the token and form version; cancel
invalidates acceptance and outstanding codes. Preview, consent, resend and verification
are exact-Origin POSTs, including
anonymous requests, and reject bearer headers. Source/identity budgets apply.
Consent and final verification recheck token, state, expiry, UUID/email binding and active
inviter authority under the shared lock. Bootstrap also requires the current
unclaimed singleton and zero active admins. Consent checks the form version.
Account/username/consent/mail/audit commit together; proof/session/grant/audit commit
together on verification. A failed enqueue or audit rolls back its transaction. Idempotent retries neither
send another code nor restore a revoked role. Token consent is audited with an
`invitee` actor kind, distinct from authenticated operator actions.

Admins see delivery states without message contents or credentials. Routine admin
and operator mutations still require cookie verification within five minutes.
When verification is too old, the operator confirms it's them (Send code or
Cancel; Cancel returns to the page), and after the code the waiting action runs
once with its original operation id, so it cannot double-apply. Grants are checked
on every operation; neither is embedded as durable session authority. Invitation
metadata can be pruned 30 days after expiry independently of grants and bootstrap.

Suspension revokes role grants, sessions and pending
incoming/authored invitations atomically. Reactivation never restores authority.
Admin accounts cannot be suspended from these tools; operators cannot revoke
another operator/admin's sessions. Admins can revoke operator roles; operators
cannot remove admins. Account email is fixed for admins and operators too; no email-change action is
available (ADR-0041).

If no active admin remains, a trusted interactive deployment `admin:recover`
command may issue a new admin invitation. It confirms the selected address,
invalidates previous pending bootstrap mail, and records deployment authority.
It never directly grants any role; the recipient must accept from the email
and verify a fresh email OTP, even if already signed in. Recovery is refused while an active admin
exists. There is no hidden web recovery endpoint or perpetual seed password.

## Account suspension and recovery

Account availability is app-owned state: `active`, `inactive` or `suspended`,
with an optional deletion schedule. See [account lifecycle](#account-lifecycle-and-action-controls)
for deactivation and deletion. Suspension:

- Denies new authenticated sessions and every existing cookie/bearer session,
  including raw better-auth session reads and mutation endpoints, product
  guards and pending code verification. Normal anonymous
  public browsing remains possible; this is not an IP block.
- Revokes sessions, operator grants and outstanding authentication/handover
  proofs. Pending mail is cancelled where possible; mail already sent cannot
  authenticate after suspension or regain validity on reactivation.
- Hides the suspended owner's hub and collections from all non-owners,
  including public discovery, handle/slug/ID reads, direct shares, link tokens,
  resources, sections and exports. The suspended owner has no authenticated
  access either. Collections they merely created and later transferred to
  someone else's hub are unaffected; current ownership determines scope.
- Rejects new direct shares and ownership transfers to a suspended account,
  using the same safe target-unavailable outcome as an ineligible/missing
  account. Existing grants remain stored but confer no suspended access.
- Preserves records, publication choices, shares, saves and ownership. Saved
  rows become dormant using the existing safe saved-list contract; shared
  lists suppress unavailable entries. No private content is returned.

Code issuance responses must not reveal whether an email is registered or
suspended. Only a caller who supplies valid proof may receive an account-status
explanation and the configured support destination. Invalid or expired proof
uses the ordinary failure. Public content remains indistinguishable from
missing content (404), without exposing the suspension reason.

Reactivation is explicit and reasoned. It allows fresh sign-in and restores
existing distribution settings, except where collection holds still apply.
The operator must be told that existing publication/share links may become
available again. It does not resurrect sessions, proofs, operator grants or
cancelled mail. No new mass notification workflow is implied.

## Collection distribution holds

A hold is separate from the owner's `published` setting. It is keyed by
immutable collection ID and applies only to that collection. Referencing it
cannot grant access or bypass the hold. Renaming or old links cannot bypass it.

- Apply a new hold only to material currently readable through publication,
  checked under the mutation lock. A stale report for now-private content
  cannot authorize inspection or a new hold. Repeating an existing hold is
  idempotent even though the content is now hidden.
- Non-owners lose reads/writes to the held collection, including direct shares
  and exports. Public lists filter before pagination; reference resources show
  a neutral unavailable entry without target titles or previews.
- Active owners can read and correct content, unpublish, disable/revoke sharing,
  remove saves or delete their collection. They see the bounded hold reason and
  support destination. They cannot publish, enable/grant sharing or transfer
  until release. Managing a reference never changes a destination's hold.
- Releasing a hold restores only access allowed by current owner settings and
  account state. It never publishes a private collection or changes another
  collection's hold. Existing public/share access may return; unpublishing,
  deleting or suspending the owner does not erase enforcement history.

Holds are independent across referenced collections. Account suspension and holds
compose: releasing either does not bypass the other. Copying content into a new
collection is a separate moderation case; automated fingerprinting is deferred.

## Persistence and enforcement

Persistence follows camelCase/snake_case conventions:

- Account availability and a version for optimistic concurrency, keyed by
  user ID; current suspension reason/time stored without a content payload.
- Separate unique admin/operator grants and a singleton bootstrap invitation
  record; protected service invitations track recipient binding, expiry, version,
  consent state and delivery reference.
- A unique `OperatorGrant` per user, with grant time and authority reference;
  grant/revoke history lives in the operator audit.
- `CollectionHold` keyed by collection ID with active state, bounded reason,
  actor/time and version; no copy of the collection's authored text.
- Operation-category records in the shared `AuditLog` with UUIDv7 ID, database timestamp, actor kind
  and optional actor user ID, target IDs, action, reason code, before/after
  state, request ID and operation ID. Audit IDs must survive target deletion.

These models do not add a role field to `User` or embed permissions in sessions.
A dedicated backend operations module owns these workflows. `resolveSessionUser`
and the app-owned auth wrapper enforce account availability; the collection
policy evaluates availability restrictions before ordinary access grants.
Every list and resource/export path must use equivalent availability rules,
including direct database queries that do not currently call the policy.
Operational account lookup is an explicit cross-user metadata query, never a
general exception to hub scoping for content queries.

Use the existing auth transaction/advisory lock when coordinating suspension,
session creation, revocation and account recovery. Recheck actor authority and
target state inside mutation transactions; lock account/collection
rows in a consistent order with the domain services. A concurrent transfer,
publication, resource-reference or share mutation must not escape a newly applied hold or
suspension. Reads begun after a restriction commits must deny access; already
returned/downloaded content cannot be recalled. Authenticated mutation races
must be serialized so a revoked actor cannot commit a later privileged action.
The shared lock order is defined in [RELIABILITY.md](../RELIABILITY.md).

Mutations take an expected version and an operation ID scoped to actor/action/
target. After current authorization, same-ID retries return the recorded
outcome; reusing an ID with a
different payload or using stale state fails safely (409). A deliberate new
session-revocation command removes sessions created since an earlier command.
Operation IDs remain deduplicated for the audit retention window; older
submissions require refreshed state and a new operation ID. UI actions never
retry automatically. Restrictions and their audit records
commit together; audit-store failure rolls back the action. Invitation and role transitions
follow the same rules. Domain collection changes keep their existing audit.

## Audit, reasons and retention

Reasons for mutations come from a bounded catalog: `spam`, `harmful_content`,
`account_compromise`, `owner_request`, `mistake_corrected`, `review_completed`
and `access_administration`, constrained to appropriate actions. There is no
free-text allegation or arbitrary JSON payload. Product copy for owners uses
safe explanations; raw reasons are never exposed to public readers.

Audit successful state changes, no-op commands, account lookup/detail access,
operator-audit reads and denied operator actions from authenticated callers.
When authority transactions are nested, denial outcomes propagate as data until
the outer transaction commits; only then does the HTTP error propagate.
Record targets as immutable IDs; a lookup with no match records only the
operation and outcome, not the searched email/handle. Never record tokens,
codes, email addresses, content, raw request bodies or session identifiers.
Unauthenticated probing remains subject to ordinary request budgets; it must
not create an unlimited operator-audit write stream. Audit reads include a
snapshot cutoff so recording a read does not destabilize pagination.

Operator events retain 365 days, then expire in bounded database cleanup.
Current grants/restrictions remain authoritative independently of that history;
cleanup must never lift a suspension or hold. Auth audit keeps its existing
90-day policy; hub audit remains separate. No delete/edit audit API or user
export of operator history ships. Routine application paths append only;
retention cleanup is the sole application deletion path. This is an operational
retention decision, not a claim of legal compliance or tamper-proof storage.

## Delivery and acceptance

The implemented journey begins with **startup admin invitation → explicit
acceptance and session verification → admin-owned operator invitations → explicit acceptance**. The
operating journey is **operator sign-in → account search →
account/session action or public-content hold → audit → recovery**. It includes
the reusable email-code sign-in/session journey; do not ship a separate admin
login protocol or a dashboard of inactive controls. The web uses `/manage` and
`/api/v1/operations/*` for the API, with immutable target IDs. The web area is
service tabs — Accounts (`/manage`), Collections, Team (admin only, `/manage/team`),
Invitations (admin only, `/manage/invitations`), Analytics and Audit Log — with listings as minimal tables and row actions that return to the same
listing. Accounts, Collections, Team, Invitations and Audit keep their headings, tabs,
filters and column headings visible on wide, tall screens while table rows
scroll in bounded regions. Team lists current admins and operators; Invitations owns sending and tracking
service invitations. Owner Access lists current collaborators under collection authority. Planned
collection invitations will reuse the presentation pattern without sharing service
invitation permissions.
Every paginated Manage table uses Load more to append rows, preserve active
filters and disappear at the end. Collections use a caller/filter-bound cursor ordered by creation time and ID,
with a cutoff; the unified list includes active holds.
Failed reads retain loaded rows and offer retry; without JavaScript the link
continues with native cursor navigation. Smaller screens use document flow.
The other tables use a read-only server action returning rendered rows and
rechecking current API authorization. The web-only `/manage/audit/more` adapter preserves search and resolved explicit identity filters and
forwards session-bound reads to `/api/v1/manage/audit`.
A required reason plus a clearly labelled button is the deliberate
step (no confirmation checkbox). All operator responses are private and
no-store; Accounts search text stays out of page URLs: the web posts it and
carries it only as a short-lived encrypted `s` value. Audit lookup inputs are
posted and preserved as normalized row-content queries; explicit identity filters resolve to full IDs. Route existence must not leak
user metadata to ordinary users. Add these literal routes ahead
of the dynamic handle route. Detailed screen contracts and Impeccable work
belong to implementation, under the existing web design documents.

Acceptance must prove active user versus operator versus suspended/revoked
operator, cookie and bearer boundaries, cross-hub privacy, no implicit grants,
rejected email changes/re-invitation, admin protection and invitation races, pending-code/session races, audit
rollback, stale/replayed actions, and restriction races with transfer/reference creation.
Exercise ID/pretty/reference/resource/export routes, public/shared/saved lists,
independent reference-target holds, owner corrections, reactivation and explicit release.
Use isolated synthetic users, disposable DB/queues and capture email. Check
no-JavaScript sign-in/recovery, keyboard, narrow screens, freshness/history and
CSRF through the actual web origin. Run `bun run verify` and
`bun run test:browser` sequentially; run `bun run test:dev` if entrypoints change.

Live sender/provider validation remains a public-release prerequisite. Operators
use the same local passwordless methods and enrolled factors as other accounts;
SSO remains planned. Authentication never creates a service grant. Service-role
acceptance always requires its invitation-bound email proof.


Invitation notifications are informational messages directing recipients to the
emailed Review invitation button. Notification IDs never authorize acceptance.
Invitation status routes remain readable but do not send people through another
link-entry page. The manual emailed-link field is shown only without JavaScript,
as an accessible fallback for fragment handling; normal email links open review
automatically. Acceptance then requires the invitation-bound email code and any
enrolled factor; a notification or token alone cannot grant authority.


## Audit identity and filtering

The single AuditLog store retains immutable actor and entity UUIDs, with no cascading
entity foreign keys. Current usernames are joined in batches at read time, not
stored snapshots. A rename changes the API label, never the recorded ID;
a missing person retains their ID. Content audit is always restricted to the
caller's hub; service authority cannot read a foreign private hub trail.

The unified `/api/v1/manage/audit` feed accepts `q` (displayed row content, including partial IDs), `view`
(actions/all), and explicit `actor` (exact username or full UUID), `targetId` (full affected
user, collection, invitation or item UUID, as applicable), `hub` (exact handle or
full UUID), `action`, `from`, `to`, `cursor` and `limit`. Target also matches the
recorded hub ID. Filters combine with AND; actor is never conflated with target.
Email belongs in Accounts lookup, not audit filtering. A missing explicit identity lookup resolves
to the nil UUID (no matches), never to an absent filter. Responses include
`meta.auditFilters` with normalized q text and actor/hub resolved to IDs; the web posts lookup inputs,
then redirects using these canonical filters. Pagination carries the search text and explicit identity IDs. Cursors bind the caller, scope, filters and snapshot
cutoff. Invalid date ranges and short target IDs are rejected.

Service collection events capture nullable `hubId` at event time. Transfers,
renames and deletion never change that context. Older events retain null: current
ownership is not evidence of historical ownership. A hub filter only matches
recorded hub context; account actions are not implicitly attributed to the
account's hub. The hub filter does not grant private-content access.

UUID abbreviations show the final twelve-digit segment without an ellipsis or
collision extension; hover reveals the full UUID. They are display hints, never
unique keys or accepted shortened references for mutations. Search accepts partial ID text. Actor and Target both display the
final ID segment directly, with no type prefix or expansion. The actor's display
therefore remains stable across username changes; explicit actor search still resolves
to the full ID; free-text search matches current displayed usernames. Hover reveals the full UUID and clicking copies the full UUID
with “Copied” feedback that clears after two seconds. Target shows only the entity
acted on (for example, the item for an item-link addition or the collection for a
collection update), without parent or related IDs. See
[RFC 9562 §5.7](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7) and
[OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

Accounts search accepts a full user UUID as an exact match, including IDs copied
from Audit Log. Other terms match username, email or hub handle fragments. Account
responses include the current username and unexpired session count; the table
shows Account (name with username beneath), Email and Last login columns; Sessions is the final count column; IDs and individual session details remain on account detail.
Last login is persisted at successful sign-in, never inferred from retained sessions.


### Account profile evidence

`GET /operations/accounts/:id` returns `OperatorAccountDetail`: the summary plus
bio, image, account updated time, suspension reason/date, `sessionsAsOf` and
`activeSessions`. Each session contains only id, createdAt, expiresAt, verifiedAt
and current (whether it is the requesting operator's session). The newest 100
unexpired sessions are returned; `sessions` remains the total at sessionsAsOf.
No tokens, IP addresses or user agents are selected or returned. Missing values
stay null, and none of these dates is called last login. See
[ADR-0022](../engineering-decisions/0022-operator-account-profile-evidence.md).

The Accounts table shows Account (name and username), Email, Role,
Status, Member since, Last login and Sessions. Clicking a row opens detail; permitted action buttons
appear at the bottom of that page. Hub, bio, suspension details and individual
session dates are on the detail page. All reads retain operator/cookie authority,
no-store responses and account.read audit recording.


## Account lifecycle and action controls

[ADR-0023](../engineering-decisions/0023-account-lifecycle-and-unified-collection-actions.md)
defines operator deactivation and admin-scheduled deletion.
[ADR-0033](../engineering-decisions/0033-permanent-hub-handles-and-self-service-accounts.md)
adds separate email-confirmed owner deactivation/recovery and deletion/cancellation.
Operator lifecycle commands clear the self-recovery marker and invalidate pending
recovery proofs through the operations version. Owners cannot use self-service to
lift operator restrictions or cancel operator-scheduled deletion. Issued hub-handle
reservations survive final cleanup.
`OperatorAccount` includes `deletionScheduledFor` and `availableActions`. The list
omits verification; session count includes only unexpired sessions.
Account detail actions continue to a reasoned, recently verified command. Restrictions
and deletion cannot target self/admin accounts. Pending deletion blocks activation
until cancelled. Cancellation leaves inactive. Maintenance removes due accounts
in batches of 25 under the authority lock and records `account.deleted` atomically.

`GET /api/v1/manage/collections` supplies one paginated, viewer-scoped projection
for owners/contributors and operators. Search accepts a full UUID or collection
URL; URL query tokens do not grant access. Foreign private held content remains
hidden. Moderation detail uses `/operations/collections/:id`.

Account summaries and details also expose nullable `lastLoginAt`, persisted by
successful ordinary/invitation sign-in in the session transaction. Account detail
shows Last login in the viewer's local timezone, including seconds; pre-tracking
accounts show “Not recorded” until they next sign in. Session refresh/expiry,
failed sign-in and rolled-back transactions never manufacture a login timestamp.
