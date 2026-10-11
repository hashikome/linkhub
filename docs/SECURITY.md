# Security

## Tenant Isolation

- The hub is the tenant boundary. Every hub-owned query carries `hubId`;
  collection-scoped lookups resolve the collection first and carry its hub.
- Route IDs never prove access. Possession of a UUID grants nothing.
- Data-access methods make unscoped queries hard to express; tenant scoping
  is verified by integration tests, not convention alone.

## Authorization

- The API is the source of truth. UI hiding is never a security rule.
- Each person has at most one hub, created on first collection ownership;
  account creation alone does not create it. See [people and hubs](design-docs/people-and-hubs.md).
  There are no hub memberships or administrative
  content-access bypasses. Service-operator authority is separate; it
  grants account operations and distribution restrictions, never private reads.
- Collection access resolves through `CollectionPolicyService`: hub owner
  (full access) → direct share (viewer/contributor) → active link → published;
  grants apply only to that collection. References grant no access, and share
  tokens never travel to referenced targets. A reference whose target the
  reader cannot open carries no target id, title or stored title override.
  Reference creation requires source write, target read and the same hub; pasted
  query tokens never authorize conversion. Foreign or unreadable collection URLs
  remain ordinary links with only a generic address-pattern hint (ADR-0047).
  Otherwise return not found.
- `contributor` shares are content-only: no publication, no share management, no
  deletion, no wider hub access.
- Prefer `404` over `403` for resources the caller cannot know exist.

## Service-operator boundary

[Service operations](design-docs/service-operations.md) checks current account
availability and admin/operator grants in the backend, including raw auth/session
paths and every content
surface. Suspension revokes sessions, proofs, applicable service roles and
pending incoming/authored invitations. Account email is fixed; no email-change
workflow is exposed. Recent completed authentication is required for operator
mutations, with enrolled protection enforced. Startup/recovery only issues the initial admin invitation. The recipient must explicitly accept using the emailed token before a UUID
grant exists, then verify a fresh invitation-bound email OTP. Consent creates no
session or role; every recipient verifies, including matching signed-in accounts.
Proof consumption, session creation, grant and audit commit atomically. Ordinary
login codes cannot verify invitations; resend/cancellation invalidates old proofs. Only admins can
invite/revoke operators; ordinary operators cannot administer peers or admins.
No email allowlist, implicit first user or SSO claim directly grants authority.

Account lookup exposes bounded operational identity data, not private content.
Public-content holds restrict distribution without giving operators new read
permissions. Operators cannot impersonate, change credentials, delete accounts
or inspect other users' hub audit feeds. Operator events use their own access
and 365-day retention policy; current restrictions outlive event cleanup.
These rules preserve ordinary collection authorization and hidden/missing
404 equivalence. Refer to the contract for recovery and atomic audit rules.

## Tokens And Secrets

- UUIDv7 identifiers are not secrets. Share links use separately generated,
  hashed, rotatable tokens. The existing read contract accepts `?s=<token>`;
  scrub query strings from logs/telemetry and prevent referrer leakage on the
  web. Auth verification challenges are expiring and purpose-bound; consuming
  proof requires POST, never a state-changing GET. Do not conflate share-link
  reads with the one-time auth challenge lifecycle.
- Share-link rotation and disabling take effect immediately, including for
  link-derived shared/ access.
- Application secrets reach services through deployment-secret `_FILE`
  inputs; never logged, never baked into images, never committed.

Operator account details expose recorded profile/status fields and at most 100
unexpired session IDs and timestamps under the existing operator cookie guard.
Credentials, IP addresses, user agents and private content are excluded; these
reads remain audited. See [ADR-0022](engineering-decisions/0022-operator-account-profile-evidence.md).

## Authentication Boundary

- Self-hosted better-auth owns verification proofs,
  sessions, and verification primitives. The product owns identity,
  authorization, and workflows.
- Session resolution goes through `resolveSessionUser`
  (`apps/api/src/common/guards/auth.guard.ts`); services consume `AuthUser`, never
  better-auth types.
- Sign-up onboarding is app-owned and auth-path-agnostic so SSO
  (`docs/design-docs/identity-sso.md`) can be added without weakening any
  invariant.
- Completed authentication uses one transaction-scoped operation for session
  assurance, last login, bound invitation completion and an account-bound audit
  event. Registration and login follow the same rule; pending proofs/factors and
  credential-management session rotation are not sign-in successes (ADR-0046).
- Google linking uses a verified authoritative same-email match or inline
  account proof, with enrolled factors enforced. Missing accounts require explicit
  creation consent. Future SSO linking must preserve equivalent identity proof;
  see [passwordless security](design-docs/passwordless-security.md).

## Origins, CORS, and CSRF

The API receives browser requests directly. Local development uses web port
3000 and API port 4000; production ingress routes `/api/*` directly to Nest on
one public origin. Next never proxies API paths (ADR-0036).

- `BETTER_AUTH_URL` is the public backend origin; `WEB_ORIGIN` is the web
  destination and the sole allowed browser Origin. Exact-origin credentialed
  CORS allows GET/HEAD/POST/PUT/PATCH/DELETE, with content-type, x-share-token
  and idempotency-key headers. Only X-Request-Id and Retry-After are exposed.
  Preflight is handled before auth and request budgets; no wildcard or suffix
  origin matching is allowed. Unapproved origins get no CORS permission.
- CORS never grants product access. Sessions/bearers and backend policy services
  remain authoritative for every request. Cookie-free bearer clients retain
  their contract; the extension uses host permissions outside page CORS rules.
- CSRF remains independent: every unsafe cookie-authenticated request must
  carry exactly WEB_ORIGIN, including multipart, bodyless and bearer-plus-cookie
  requests. Missing/null/foreign origins fail closed. Auth handlers also reject
  cross-site mutations and retain Better Auth origin checks/trustedOrigins.
- Backend callbacks set host-only cookies. Local API/web addresses must use the
  same hostname and scheme (localhost on different ports); production keeps
  one public origin. No cross-site cookie attributes or sibling-domain cookie
  sharing are introduced. Passkeys verify the web origin and hostname RP ID.
- Browser config contains only the validated public API origin. Private
  API_INTERNAL_ORIGIN, source attribution and credentials remain server-only.
  Native web forms still accept only the exact web origin and adapt input to
  backend requests; business rules and OAuth exchange remain backend-owned.

## Boundary Validation

- External input is validated at HTTP and upload boundaries (global
  `ValidationPipe` with whitelist + forbidNonWhitelisted; file size/type
  checks on imports). Multipart import parsing enforces a 10 MiB file limit,
  one file, two fields and three parts before acquiring the shared authority
  lock. The authenticated session is rechecked under that lock after parsing.
- Imports require an existing owned hub. Private drafts bind to the account and
  hub; only owner-managed collections may be targets. No service-role bypass.
  Invalid addresses remain repairable rows; malformed file structure rejects the
  upload. Draft edits and commits require a revision. The API rechecks destinations
  and writes content, receipts and audit evidence in one authority transaction.
  Shared metadata workers enforce DNS/redirect/SSRF rules outside that transaction.
- Import lookups have a separate account budget of 15,000 candidate URLs per day;
  retries count. Reads/polling use the ordinary read budget, draft mutations the
  write budget; only draft creation consumes the file budget. Files are parsed
  in memory and not retained; draft rows expire after 30 days without changes.
- Product HTTP errors use a shared catalog and an explicit trusted exception
  boundary. Arbitrary framework messages/details are discarded; validation
  exposes only declared DTO field paths and bounded rule identifiers. Unknown
  input field names, submitted values and SQL errors are never reflected in
  error envelopes. Raw better-auth keeps its own protocol; see conventions.

## Auditability

Content changes, discussion moderation, collection management, sharing, transfer
and hub name/handle changes write content-category records in `audit_logs` in the action’s PostgreSQL
transaction. [Attribution and activity](design-docs/attribution-and-activity.md)
owns the action catalog and reader-facing history contract.
The audit row has typed action, immutable actor/hub/collection/target-user IDs,
optional role and database timestamp; no email, handle, token or authored text.
Core management entries additionally hold bounded before/after state and outcome
under [ADR-0021](engineering-decisions/0021-bounded-audit-effects.md); the writer
allowlists states by action. No arbitrary payloads or historical content snapshots.
Collection management rechecks ownership under a row lock before mutation.

`GET /api/v1/manage/audit` derives access from the current session: owners see
their hub content and their authentication events; service authority additionally
permits operation/authentication evidence, never foreign private content. Caller
hub IDs and foreign pagination cursors cannot widen access. Each read also
records `audit.read`. Transfers write source/recipient events, and historical
rows stay with their original hub. Audit identifiers deliberately have no
cascading foreign keys: deleting a collection cannot erase its history.

Content audit evidence is durable; authentication and operation categories retain
90 and 365 days respectively. Generic profile writes and vendor deletion routes
cannot delete accounts. App-owned email-confirmed self-service actions support
deactivation, reactivation, deletion and cancellation (ADR-0033). Deactivation
retains data indefinitely; deletion schedules cleanup after 14 days. Cancellation
before the deadline leaves the account inactive. Admins can separately schedule
non-admin deletion under the [service operations policy](design-docs/service-operations.md).
Profile writes reject user UUID, email and password, including mixed-field updates. Password authentication is disabled in better-auth and
its public signup, login, enrollment, change and reset routes are unavailable.
Account email is fixed; native and former app email-change routes are unavailable
([ADR-0041](engineering-decisions/0041-fixed-account-email.md)). A future controlled
identity change requires a dedicated POST action, never profile PUT/PATCH. Account-action proofs bind the
action, account and operations version, plus the initiating session for active
account actions. Recovery requires an eligible self-deactivated account and never
lifts operator restrictions. Successful actions revoke access and commit with
their audit record under the authority lock; recovery requires fresh sign-in.
Ordinary sign-in reveals eligible recovery only after a correct email code:
[ADR-0040](engineering-decisions/0040-contextual-account-recovery.md). Discovery
creates no usable session. The ten-minute recovery capability binds UUID, email,
version and action; preview and consent recheck current eligibility. Anonymous
email entry remains uniform, and recovery never lifts operator restrictions.
Issued hub handles remain reserved after deletion. See
[auth integration](design-docs/auth-delivery-integration.md).
Auth security outcomes, account recovery and all-session
revocation are transaction-bound. Shared identity budgets complement source
throttles; codes expire after five minutes with three wrong attempts allowed.
Auth audits retain 90 days; collection audit/deletion policy remains separate.

## Abuse protection

Every non-probe request admitted by the browser-origin boundary consumes an atomic PostgreSQL-backed source budget,
shared by replicas: auth 30/minute, import creation/exports 10/minute, other writes
60/minute, reads 300/minute. The HTTP boundary runs before better-auth/body
parsing, returns 429 plus Retry-After, and fails closed with a safe 503 when
the budget store fails. Liveness/readiness GETs remain available.

Store only a namespaced HMAC of scope/source using the auth secret, not raw IP
addresses. Rotating the secret resets effective budgets. Trust no forwarded
source by default; `TRUSTED_PROXY_CIDRS` accepts explicit addresses/CIDRs only.
Configure the actual ingress boundary before deployment. These conservative
per-source limits share capacity for users behind NAT and are not a distributed
attack solution. Auth delivery also enforces account/challenge budgets. Configure ingress
connection/body limits during live deployment.

Web server rendering preserves the visitor's source budget through signed
attribution. `apps/web/server.ts` derives the source from its socket, walking
forwarded addresses only through explicit `WEB_TRUSTED_PROXY_CIDRS` hops, and
overwrites caller-supplied read and form attribution headers. The shared transport
authenticates this server-stamped request context and signs fresh 30-second HMAC
proofs immediately before API forwarding, including after slow body uploads. Only the read budget accepts `x-web-read-source` proofs;
invalid/absent proofs use the normal API socket/proxy source. Native web POST
forms use a separate `x-web-form-source` proof/HMAC domain for source budgets,
including the POST, PATCH and DELETE API requests they forward.
All visitor-triggered server API calls use the mandatory attributed transport,
including recovery-storage POSTs during SSR. It renews both entry-point proofs,
requires valid signed context before sending, and overwrites outgoing proof values;
the API chooses the applicable proof domain. Feature code cannot call the low-level
HTTP adapter directly (`check:web`). Background calls require a separately reviewed
service policy, never a missing-context bypass. See
[ADR-0052](engineering-decisions/0052-mandatory-visitor-attribution.md).

Documents use `strict-origin` referrers so native browser POSTs retain Origin
without disclosing paths or query tokens; external resource links still use
`no-referrer`. The web validates the browser Origin before forwarding JSON, and the API
independently checks Origin, sessions and current authority. Read proofs cannot
be used as form proofs. They carry no
authentication or authorization. API and web share an independent
`WEB_SOURCE_SECRET` (at least 32 random characters, `_FILE` in production).
Do not log the proof or expose it in browser data. The web entry point requires
this secret; invoking `next start` directly bypasses this boundary and is unsupported.
Ingress must overwrite incoming forwarding headers and both services must trust
only its actual addresses. Until that topology is configured, no forwarded IP
is trusted. Root `bun run dev` supplies an ephemeral shared secret with no web
proxy trust, so direct local connections work without extra setup.

Expired counters are pruned in bounded batches; audit history is retained
until its separate policy is decided. Both stores are product persistence,
never external telemetry payloads.

## Personal Data

- Store the minimum: email, username, full name and optional image. The public description
  belongs to the hub.
- Logs and API telemetry use a strict allowlist; request IDs are
  server-generated and never echo caller input.


## Interrupted actions and step-up verification

Email-code verification is one flow with a purpose (sign in, first link,
continue, resume, confirm, invitation; `apps/web/src/lib/verification.ts`).
An action interrupted by verification — a sensitive operator action needing a
fresh code (`recent_auth_required`, "Confirm it's you") or any form action whose
session ended — is encrypted with AES-GCM for 15 minutes and replayed once
after the code, with the new session. Only same-origin form posts can create it
(`formData()` rejects other origins and cross-site requests), it never targets
`/api/v1/auth/*`, and operator replays keep their `operationId`, so they cannot
double-apply. A waiting action belongs to someone: every sign-in leaves a
keyed one-way fingerprint of the email in an HttpOnly `last_account` cookie, an
interrupted action records it, and the replay runs only if the same email signs
in again. A different person signing in on that browser gets an ordinary
sign-in and the action is discarded; with no known owner, nothing is kept.
Signing out clears both cookies.

## Public link addresses

Saved links are for sharing, so a link's host must be reachable on the public
web: `isPublicLinkHost` (`packages/types/src/links.ts`) refuses IP literals,
single-label names, local/internal suffixes and RFC 2606 / 6761 reserved names.
The API enforces it through `publicLinkUrl` on capture, add-link, imports
(row error `not_public_url`) and link previews (`link_not_public`); the web
form applies the same rule for early feedback. This is a product rule, not the
SSRF boundary: title fetches still check every resolved address below.

## Outbound fetches for link metadata

A saved link's page is fetched only to read its text metadata — title,
description and site name, never images or icons
(`apps/api/src/modules/resources/page-metadata.ts`). The worker does it for
pending `link_metadata` rows (written by saves, imports and reads of links
without metadata; at most one request per site per second per worker, retries
at 1 minute, 10 minutes, 1 hour and 6 hours), and the API does it for the
save form before and after sign-in through `GET /api/v1/link-preview` (its own 30/min request
budget), which answers from stored metadata first. YouTube addresses
are asked through YouTube's oEmbed endpoint (a small JSON document, 64 KB cap)
under the same guards. Because the URL is
user-supplied, the fetch is treated as an SSRF surface: http(s) only, default
ports only, no credentials in the URL, every DNS answer must be a public
unicast address (private, loopback, link-local, CGNAT, multicast, documentation
and IPv4-mapped forms are refused) and the connection is pinned to the vetted
address so DNS rebinding cannot redirect it. Redirects are followed manually
(max 3) with the same checks; one aborting 3 s wall-clock deadline covers DNS
waiting, all redirects and body consumption, with a 256 KB body cap. Expiry
closes the active socket; a late DNS answer cannot start a connection,
and only `text/html` (or, for oEmbed, JSON) responses are parsed. The request carries no cookies,
tokens or user identity. Nothing but the title, description and site name is
stored, once per address. `LINK_TITLES=off`
disables it; tests disable it unless `LINK_TITLES=on`.

Account deactivation and pending deletion block authentication and distribution just as suspension does. Self-service and admin-scheduled deletion have a 14-day grace period; cancellation and terminal cleanup serialize through the authority lock (ADR-0023/0033). Unified collection management never grants service operators private content access.

Public avatar images follow [ADR-0034](engineering-decisions/0034-public-gravatar-avatars.md):
only active, verified accounts without pending deletion may serve a Gravatar.
Eligibility and email are rechecked after provider resolution; all other cases
use the same generated fallback. User-ID responses are no-store, provider hashes
stay server-side, and provider caches never bypass current account checks.

## Passwordless security

[ADR-0035](engineering-decisions/0035-passwordless-account-security.md) and the
[focused design](design-docs/passwordless-security.md) govern passkeys, Google,
TOTP and recovery. A passkey must cryptographically prove WebAuthn user
verification; a browser preference alone is insufficient. Protected email/Google
sign-in has no usable session until a registered factor or recovery code passes.
Recovery codes are single-use and do not disable factors. Enrollment/removal and
code rotation require completed authentication within ten minutes, then revoke
other sessions and pending challenges. No trusted-device or email-only recovery
bypass exists. Account lifecycle recovery preserves enrolled protection.

Google disables provider-only implicit and requested signup. [ADR-0039](engineering-decisions/0039-confirmed-google-account-creation.md) allows explicitly confirmed creation from a staged verified Google identity. For a missing account, callback creates no account/session; consent creates and links atomically without another inbox code. Invitations always require their separate email proof. Automatic first linking to an existing account requires
an authoritative verified Gmail/Workspace email; other Google email addresses
complete a first-time same-email proof within sign-in (ADR-0037). The backend
stages the state-validated provider subject in an encrypted, ten-minute,
browser-bound record and connects it only with completed authentication,
including any enrolled factor. Existing-account pending proof binds user UUID, email and account
version; new-account proof requires absence at consent and creation by that same registration transaction; stale, replayed, revoked or mismatched proof fails closed. Optional
explicit Settings linking still binds its callback to the initiating session and
account version. Provider subject IDs identify
subsequent logins. OAuth secrets support `_FILE` inputs; OAuth access/refresh tokens and TOTP/recovery
secrets are encrypted by Better Auth. Neither public profiles nor client payloads
expose stored credentials. Tests use synthetic provider credentials only.

## Explicit ordinary registration

[ADR-0044](engineering-decisions/0044-explicit-auth-entry-and-optional-hub.md) separates
entry intent while keeping backend-owned authentication. Ordinary email verification
of an unknown identity stages encrypted browser-bound proof, not a user/session.
Only explicit confirmation creates; optional hub creation is atomic. Better Auth
owns OTP expiry, attempts and atomic consumption. Expired/replayed proof and an
account appearing between verification and creation fail closed. Starting a new
independent email, Google, passkey or invitation flow discards old creation proof.
Previews receive per-visitor attributed read budgets. Return destinations remain
validated web context and cannot change account identity. Capture alone supplies
explicit creation consent in its code request; invitations use their isolated flow.


### Oversized interrupted actions

Actions too large for a 3,800-character cookie value use an opaque 256-bit reference
cookie. The API stores only the encrypted payload under a SHA-256 hash of that
reference, with a 15-minute expiry and a 64 KiB payload ceiling. The web service
signs storage commands with `WEB_SOURCE_SECRET` in a separate cryptographic domain;
proofs bind operation, token, payload, and a timestamp valid for 60 seconds.
Browsers cannot issue authorized storage commands. Reads never grant domain access;
replay still requires the matching account fingerprint and current API policy.
Storage outages surface as failures. Consumed payloads are deleted; API maintenance
prunes expired records in bounded batches. See
[ADR-0051](engineering-decisions/0051-durable-interrupted-actions.md).
