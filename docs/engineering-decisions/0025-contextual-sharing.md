# ADR-0025: One contextual Share page

Status: Accepted (2026-10-09).

## Context

Sharing is useful from profiles, hubs, collections and the site. Duplicated
screens would diverge in clipboard behavior, return navigation and URL handling.
Username-based profile URLs cannot provide permanent share addresses.

## Decision

Use one typed `/share` page with reusable ShareAction and ShareScreen components.
Resolve subjects from immutable IDs through existing API access boundaries;
never take arbitrary share URLs or titles from query parameters. Add public
profile lookup and viewing by immutable user ID alongside readable username
routes. Reserve `share` as an application username.

Use explicit validated local return paths so navigation works without JavaScript
and preserves source filters. Keep Copy link and the contextual return link;
social integrations remain deferred. Preserve collection-owner access controls.
Public collection URLs omit tokens; explicit private access URLs retain their
collection token and do not grant any new permission.

## Consequences

A new shareable resource can reuse the layout and entry action with an explicit
server resolver. Permanent person links now survive renames, like hub and
collection links. The collection action dispatcher delegates Share to the common
page rather than rendering a second screen.

## Amendment: API-owned sharing and scoped analytics (2026-10-09)

The web resolver moves into `GET /api/v1/share/resolve`, exposing a shared
ShareDescriptor. This supersedes the intermediate read-only GET/POST `/share`
proposal: POST now creates a ShareEntry and returns its complete representation
immediately with 201; GET lists creator-owned entries. Messages remain plain-text
JSON, separate from generated URLs. The optional destination is a label, not a
recipient or delivery instruction. Optional operation UUIDs make creation retries
idempotent.

The user expanded the service into a foundation for authenticated API clients
and potential paid API analytics. Separate three boundaries: creator entries and
counts, current resource owner's aggregate counts (no other people's messages),
and audited admin service metadata/counts (no private content). Existing API
bearer authentication serves personal/resource analytics; service authority keeps
its existing cookie restriction. This does not introduce API keys or billing.

Generated URLs carry `share_id`. Matching resource opens are recorded by an
idempotent event endpoint after current access checks. These are reported opens,
not unique humans or delivery evidence. ShareEntry and ShareOpen never grant
access, store private bearer tokens, or retain recipient IDs/IP/user-agent data.
Creator deletion cascades these records. Resource references can outlive deletion;
creator history then returns null resource context. Admin history does not expose
messages or resource descriptors.

The web creates an entry on authenticated Copy link and reports visible,
successfully loaded destinations. Preview GET, server rendering/prefetch and
no-JavaScript visits do not record opens. Anonymous/manual copying remains
available. These choices make the API reusable without turning page rendering
into a write or introducing a private-content bypass. See the
[sharing design](../design-docs/sharing.md) for the full contract and measurement
limits. A dashboard, paid credentials, retention/rollup policy and wider activity
measurement remain separate milestones.


## Amendment: Manage service analytics for operators (2026-10-09)

The user clarified that the Analytics section belongs to operators as well as
admins, like Audit Log. This supersedes the admin-only restriction for aggregate
service analytics above and completes the initial service dashboard milestone.
`GET /api/v1/share/analytics?scope=service` now accepts either live service grant
through existing audited cookie authority. Individual service entry list/detail
remain admin-only; operators receive counts and destination/kind groups without
messages, creator identities or resource content. Personal/resource scopes retain
their existing rules. Grant revocation applies on every request.

The web tab sits immediately before Audit Log. It shows all-time totals and
breakdown tables with native Refresh and last-loaded time. Manual refresh makes
newly copied links and reported opens observable without background polling or
repeated audit traffic. Counts retain their reported-open semantics; no unique
visitor, delivery or conversion claims are introduced.

## Clarification: event detail and maintained counters (2026-10-09)

Keep both `share_entries` and `share_opens`. The former holds the original share
context and its incremented `open_count`; the latter holds individual opening
events and their timestamps. Future event-specific metadata belongs on
`share_opens`, allowing that model to expand without corresponding fields or
metadata-update logic on `share_entries`.

The stored counter is a deliberate read-performance choice. Entry reads use it
directly and aggregate analytics sums it, avoiding a recount of opening events
for every list, detail or dashboard request as event volume grows. The cost is a
counter update alongside each new event. We accept that write cost and maintain
consistency by committing the event insert and atomic increment together. Unique
`(share_id, event_id)` plus increment-on-insert makes retries count once; rollback
undoes both writes. Replacing this counter with per-request derivation is not the
intended design. This clarification changes no schema, behavior or collected data.


## Amendment: sharing intent and forgiving event metadata (2026-10-09)

Supersede the standalone destination field with optional ShareEntry.context JSON.
It records creation intent; destination lives at context.destination and campaigns
are optional custom context. Destination search and grouping read that key rather
than grouping entire objects. Keep arbitrary context private in service metadata.

ShareOpen gains separate attribution and context JSON, optional client occurredAt,
and a nonunique analytical payloadHash. Attribution accepts common utm_* keys only;
custom data belongs in context. Save valid optional evidence, ignore invalid fields
with successful-response warnings, and never lose an otherwise authorized valid
open because optional metadata was malformed. Transport parsing/size limits and
required target/event identity remain strict. New events return 201, retries 200;
warnings do not change those statuses. This explicitly supersedes always-200 opens.

Maintain open_count. Deduplicate solely by share ID and client UUID event ID, not
payload hashes or timestamps. Hash normalized content without timestamps or event
ID to compare matching content; this is not evidence of fraud or a real visit.
Record server received time separately from optional, untrusted client occurrence
time. Provide a shared event factory and UTM selector; no server round trip to mint
an event ID. The web submits recognized attribution and timezone context only.

Emit `via` in resource URLs instead of `share_id`; internal database relationships
remain explicitly named share_id. Accept older web links while emitting only via.
Attribution labels are received claims and forwarding can preserve old labels.
Referral-specific rewards, social buttons and new attribution analytics UI remain
deferred. This is preproduction: schema changes still receive reviewed migrations
and parity checks, but no experimental payload/digest compatibility layer is needed.

## Cleanup amendment (2026-10-09)

Retire experimental `share_id` web query support; `via` is the sole tracking
parameter. This supersedes the earlier compatibility exception. Database foreign
keys remain `share_id`. Share actions link directly to `/share`; the collection
dispatcher no longer redirects there. Remove unused social-message templates until
social actions are implemented. Copy retains the API default and URL-only clipboard.
