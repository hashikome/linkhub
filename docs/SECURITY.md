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
  Otherwise return not found.
- `contributor` shares are content-only: no publication, no share management, no
  deletion, no wider hub access.
- Prefer `404` over `403` for resources the caller cannot know exist.

## Service-operator boundary

[Service operations](design-docs/service-operations.md) checks current account
availability and admin/operator grants in the backend, including raw auth/session
paths and every content
surface. Suspension revokes sessions, proofs and service roles; email
change removes both service roles and cancels incoming/authored invitations. Recent code authentication is required
for operator mutations. Startup/recovery only issues the initial admin invitation. The recipient must explicitly accept using the emailed token before a UUID
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
- Account linking (SSO or otherwise) is explicit: verified-email match or an
  authenticated linking step — never silent takeover.

## Origins, CORS, and CSRF

**There is deliberately no CORS configuration anywhere, and none is missing.**
Recorded so a future security review doesn't read the absence as an oversight:

- CORS is not an access-control mechanism — it is the server *relaxing* the
  browser's Same-Origin Policy so foreign origins may read it. Configuring
  nothing means no relaxation was ever granted: browser scripts on any other
  origin cannot read API responses, enforced by every browser, at full
  default strength. The absence *is* the implementation.
- Nothing needs the relaxation by design: the web app is same-origin with the
  API (one public origin, Traefik path-routes `/api/*`; Next.js rewrites in
  dev — `docs/design-docs/infra-deployment.md` § Origins), and the planned
  extension uses with `host_permissions` + bearer tokens, outside page
  origin rules.
- CORS could never be the security boundary anyway: non-browser clients
  (curl, servers, apps) do not enforce the Same-Origin Policy. Real access
  control is authentication (sessions/bearer) + `CollectionPolicyService` —
  per the invariant that client-side behavior is never a security rule.
- **CSRF is a separate concern**: a cross-origin page can send simple requests
  even when it cannot read the response; whether cookies accompany them also
  depends on cookie/site policy. JSON preflight is not sufficient protection
  for every route: imports accept multipart and some commands are bodyless.
  The HTTP boundary rejects every unsafe request carrying a session cookie
  unless its Origin exactly matches `BETTER_AUTH_URL`, including multipart,
  bodyless actions and bearer-plus-cookie requests. Missing/null/foreign
  origins fail closed; cookie-free bearer clients remain supported. Auth routes
  additionally retain better-auth origin checks. Browser fixtures exercise
  issuance, session reads and origin enforcement through the actual web origin.
  Each future mutation UI still owes its own end-to-end acceptance.
- Adding a second public origin later is a deliberate act: CORS with exact
  origins + credentials + exposed headers, together with better-auth
  `trustedOrigins` — never a wildcard.

## Boundary Validation

- External input is validated at HTTP and upload boundaries (global
  `ValidationPipe` with whitelist + forbidNonWhitelisted; file size/type
  checks on imports). Multipart import parsing enforces a 10 MiB file limit,
  one file, four fields and five parts before acquiring the shared authority
  lock. The authenticated session is rechecked under that lock after parsing.
- Import parsers must fail per-row with clear errors rather than corrupting
  state.
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
Profile writes accept neither email nor password. Password authentication is disabled in better-auth and
its public signup, login, enrollment, change and reset routes are unavailable.
Email change revokes every session; the person must sign in with the new
address. It never transfers the account or hub. Account-action proofs bind the
action, account and operations version, plus the initiating session for active
account actions. Recovery requires an eligible self-deactivated account and never
lifts operator restrictions. Successful actions revoke access and commit with
their audit record under the authority lock; recovery requires fresh sign-in.
Issued hub handles remain reserved after deletion. See
[auth integration](design-docs/auth-delivery-integration.md).
Auth security outcomes, double-verified email changes and all-session
revocation are transaction-bound. Shared identity budgets complement source
throttles; codes expire after five minutes with three wrong attempts allowed.
Auth audits retain 90 days; collection audit/deletion policy remains separate.

## Abuse protection

Every non-probe request admitted by the browser-origin boundary consumes an atomic PostgreSQL-backed source budget,
shared by replicas: auth 30/minute, imports/exports 10/minute, other writes
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
overwrites any caller-supplied `x-web-read-source`. Server reads forward this
30-second HMAC proof to the API. Only the read budget accepts `x-web-read-source` proofs;
invalid/absent proofs use the normal API socket/proxy source. Native web POST
forms use a separate `x-web-form-source` proof/HMAC domain for source budgets,
including the POST, PATCH and DELETE API requests they forward.
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
session ended — is kept in a 15-minute HttpOnly AES-GCM cookie and replayed once
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
