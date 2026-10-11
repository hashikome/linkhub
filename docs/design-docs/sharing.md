# Contextual sharing

Status: implemented for profiles, hubs, collections and the site. Social destinations remain deferred.

The site-wide “Share linkhub” entry lives in the shared footer alongside Support.

One `/share` page renders the resource name, share heading, labeled URL, Copy link
and a contextual return link below. Copy link is visible but disabled before
hydration; without JavaScript, the URL remains selectable for manual copying.
There is no Cancel control. Collection owners retain their existing access
controls below the link.

`ShareAction` accepts a typed target (`profile`, `hub`, `collection`, or `site`)
and the local source path. Resource targets carry immutable IDs, not names or
handles. The server resolves the public profile/hub or accessible collection
through the API; query parameters cannot supply arbitrary titles or external
share URLs. `ShareScreen` provides the common layout. Collection actions link directly to this page.

Copied addresses use the configured public origin and `/people/{userId}`,
`/h/{hubId}`, `/c/{collectionId}`, or `/`. Username and handle changes do not
break these addresses. Profiles are publicly resolved through
`GET /api/v1/people/:id` using the same projection and active-account rules as
the username lookup. The username `share` is reserved for the application route.

Copying a link grants no additional access. Public collection addresses omit
access tokens. An explicitly supplied private collection token is retained only
for that collection; owner-only controls still require API capabilities.

Entry actions preserve their source path and query in `returnTo`. This is
validated as a local path; it never permits an external redirect. The return
label reflects the destination (for example, Back to profile or Back to
collections). Direct entry falls back to the resource, or home for site sharing.

## Sharing an exact item

Expanded collection items offer “Copy link to this item”. The browser copies an
absolute collection address with `item={resourceId}` and the matching item anchor,
keeping the supplied collection access context. Following it opens that item and
its section, including items beyond the first page. Copying stays on the current
page and confirms “Link copied.”; it grants no access or creates a tracked share
entry. Resource titles continue to open the resource destination.

When clipboard access fails, a labeled read-only URL appears for manual copying.
Without JavaScript, the existing item permalink remains a native link. The
fictional homepage demo keeps its direct external resource link instead.

## Accepted commercial boundary (implementation pending)

[ADR-0028](../engineering-decisions/0028-free-public-curation-paid-private-sharing.md)
adds owner entitlements and private quotas to the existing authorization model.
Public sharing and contributor invitations are free; free private collections are
owner-only. Private access links and both viewer/contributor invitations require
the owner's paid entitlement, not the recipient's. Payment never grants access by
itself. Check public-to-private transitions, existing grants, transfers, invitation
acceptance and entitlement expiry so contributor grants cannot bypass private
sharing requirements. Current development code does not yet enforce this boundary.

## API contract

The API is shared infrastructure for web, extensions and authenticated API clients.
A share entry is a request to prepare a link and message, not an access grant or
proof that somebody sent or received it. Personal API analytics and service
analytics share the same evidence store with different projections.

| Request | Result and authority |
| --- | --- |
| `GET /api/v1/share/resolve?kind=collection&id={uuid}` | Read-only preview; optional authentication and existing resource policy. Does not create an entry. |
| `POST /api/v1/share` | Authenticated creation; `201` with the complete entry and `Location: /api/v1/share/{shareId}`. Cookie or bearer authentication. |
| `GET /api/v1/share?q=value` | Creator's entries, cursor paginated, always an array. |
| `GET /api/v1/share/{shareId}` | One creator-owned entry, or 404. |
| `POST /api/v1/share/{shareId}/opens` | Report a successfully loaded matching resource; optional authentication, current resource authorization required. |
| `GET /api/v1/share/analytics` | Aggregate the caller's created entries. |
| `GET /api/v1/share/analytics?scope=service` | Operators/admins: aggregate service counts under audited cookie authority. |
| `GET /api/v1/share/analytics?scope=resource&kind=collection&resourceId={uuid}` | Current resource owner's aggregate counts, including entries created by others. No messages or sharer identities. Also supports owned hub or own profile. |
| `GET /api/v1/share?scope=service` | Admin-only service metadata, without messages or resource content. Same scope supported for detail. |

### Creation and resolution

Kinds are `profile`, `hub`, `collection`, and `site`. Resource IDs are immutable
UUIDs; site has no ID. POST accepts this JSON:

```json
{
  "kind": "collection",
  "id": "019a0000-0000-7000-8000-000000000001",
  "message": "Useful references for our team.",
  "context": { "destination": "WhatsApp", "campaign": "reading-week" },
  "operationId": "019a0000-0000-7000-8000-000000000002"
}
```

`message` is optional trimmed plain text, bounded at 1000 characters. Blank
message uses the default `Share {kind}`: Share profile, Share hub, Share collection
or Share site. Optional `context` is a JSON object for sharing intent and client
metadata, including nested objects/arrays. It is limited to 8 KiB, depth 6 and
256 total JSON values. `context.destination`, when supplied, is a trimmed string
of at most 100 characters; blank/null is omitted. Unknown destination stays absent.
Campaigns and other custom data need no dedicated columns. Context does not add
UTM parameters to the generated URL. Optional
`operationId` makes retries safe per authenticated creator: the same normalized
payload reuses the entry; a changed payload returns conflict. Without it, each
POST creates a new entry. There is no extra GET required after creation:

```json
{
  "data": {
    "id": "019a0000-0000-7000-8000-000000000003",
    "kind": "collection",
    "resourceId": "019a0000-0000-7000-8000-000000000001",
    "createdByUserId": "019a0000-0000-7000-8000-000000000004",
    "createdAt": "2026-10-09T07:00:00.000Z",
    "openCount": 0,
    "message": "Useful references for our team.",
    "context": { "destination": "WhatsApp", "campaign": "reading-week" },
    "resource": {
      "kind": "collection",
      "id": "019a0000-0000-7000-8000-000000000001",
      "name": "Backend building blocks",
      "url": "https://links.example.com/c/019a0000-0000-7000-8000-000000000001?via=019a0000-0000-7000-8000-000000000003",
      "path": "/c/019a0000-0000-7000-8000-000000000001?via=019a0000-0000-7000-8000-000000000003",
      "access": "public",
      "capabilities": { "canManageAccess": false }
    }
  }
}
```

Preview returns `ShareDescriptor` directly inside `data`: resource fields plus a
default `message`, without a tracking ID. Custom message text belongs in POST
JSON and the response, never URL parameters. Clients render messages as text.
The API owns configured public origin (`BETTER_AUTH_URL`, fallback
`http://localhost:3004`), URL construction, visibility, token validation and
capabilities. `access` is public, link (valid explicit private token), or
restricted (recipients need existing access). Unknown/inaccessible resources
return 404 without a name. Public URLs never carry private tokens.

### Entry search and analytics

Personal `q` searches exact share/resource UUIDs and case-insensitive literal
message/context.destination substrings. Explicit `id`, `resourceId`, `kind`, `message`
and `destination` filters can be combined. Limits are 1–100 (default 20); cursor
scope includes caller and filters. A single matching record remains a list.
Service `q` searches IDs and destinations only and rejects the `message` filter.
Service metadata includes IDs, creator, creation date and open count;
`message`, `context` and `resource` are null. Arbitrary creator context is private. Individual service entries use existing audited
admin cookie authority; aggregate service analytics accepts operators and admins.
Service access never accepts an ordinary user's or a service role's bearer token.

Analytics supports optional `kind`, `resourceId`, inclusive `from` and exclusive
`to` timestamps. Time filters select share creation times; `opens` and grouped
open counts are lifetime opens for those selected entries. Results include
`total` share requests, `opens`, `byKind`, and the top 100 `byDestination` groups
with counts and opens. `otherDestinationCount` counts requests outside those
groups. Destination groups read only context.destination, so differing custom
context does not split one destination group. Labels are client-supplied, so spelling/case differences are separate
groups. Resource analytics checks current ownership, not authorship or a direct
collection grant. Service-wide analytics requires operator or admin authority.

### Why share entries and opens are separate tables

`share_entries` (`ShareEntry`) stores the original sharing context and the
maintained `open_count` counter, exposed as `openCount` in the API.
`share_opens` (`ShareOpen`) stores one row per accepted opening event, linked by
`share_id`, with its event ID and timestamp.

The counter is intentional: entry reads use it directly, and aggregate analytics
sums entry counters rather than recounting an ever-growing set of open events on
every request. This exchanges one small counter update per new event for cheaper
repeated list, detail and analytics reads. Keep incrementing the counter; event
storage is not a reason to replace it with an on-demand count.

Event-specific detail belongs in `share_opens`. Future fields about an individual
open can extend that table without changing the original share context or adding
corresponding fields and update logic to `share_entries`. Apart from its counter,
the share entry does not change when somebody opens the link. Opener identity is
not currently recorded; any future addition is a separate feature decision.

The event insert and counter increment commit in the same transaction. A unique
`(share_id, event_id)` prevents duplicate retry events, and the counter increments
only when a new event row is inserted. A failed transaction rolls back both.
This keeps the event history and maintained count consistent without normal reads
having to reconstruct the count.

### Open attribution and event context

Generated URLs add `via=<share entry UUID>`, which grants no resource or history
access. Only `via` is accepted for web tracking; experimental `share_id` URLs are retired.
After successfully loading the resource clients POST to `/api/v1/share/{id}/opens`:

```json
{
  "kind": "collection",
  "id": "019a0000-0000-7000-8000-000000000001",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "occurredAt": "2026-10-09T20:00:00+03:00",
  "attribution": { "utm_source": "newsletter", "utm_medium": "email" },
  "context": { "timezone": "Africa/Dar_es_Salaam", "placement": "footer" }
}
```

The backend matches target kind/ID, rechecks current visibility/access and
atomically inserts the event and increments its entry's count. Required target,
share ID and UUID event ID remain strict. The unique `(share_id, event_id)` is the
only deduplication key; a retry never replaces existing event metadata or increments
again. Two matching payloads with different event IDs are separate opens.

A newly inserted open returns **201 Created**, a retry **200 OK**, regardless of
optional metadata warnings. The body is `{ data: { recorded: true, created: true },
warnings: [] }`; retries have `created: false`. Warnings use stable
`optional_field_ignored` codes, safe field paths and explanations, never submitted
values. Unsupported attribution names produce one generic attribution warning.
No dedicated warning HTTP status is used; 202 would mean unfinished processing.

`share_opens.attribution` is optional JSON accepting only `utm_source`,
`utm_medium`, `utm_campaign`, `utm_id`, `utm_term` and `utm_content`. These standard
names retain their UTM spelling. Each nonblank string is trimmed, capped at 256
characters and stored. Unknown keys and invalid values are ignored with warnings;
other valid keys survive. Null/omitted/empty metadata is normal, with no warning.
UTM values are client-supplied attribution claims, not verified arrival channels.

`share_opens.context` is a separate optional JSON object for additional client
information, bounded like entry context. Malformed, oversized, excessively nested
or database-unsafe context is omitted as a field with a warning. Malformed
attribution is likewise omitted. This forgiveness applies after parsing the request:
invalid JSON, overall request size/rate limits, required identity and access checks
still apply. No optional metadata validator may reject an otherwise valid open.

`createdAt` records server receipt/transaction time. Optional `occurredAt` stores a
client-reported ISO timestamp with explicit timezone (normalized to UTC), allowing
delayed submissions. Invalid timestamps are ignored with a warning. Client times
are untrusted; stored UTC receipt time remains independent. Nighttime analytics
must choose a reporting timezone or use explicitly supplied timezone context.

`payloadHash` is a backend SHA-256 of normalized kind, resource ID, attribution and
context, with recursively sorted object keys. It excludes event ID, occurredAt and
server timestamps so repeated content can be compared. It is neither unique nor
an acceptance/rejection rule. It is not returned as a public credential. No opener
identity, IP or user agent is automatically recorded. Clients choose their metadata
and should not submit secrets or private access tokens in context.

`createShareOpenEvent(payload)` in `@linkhub/types` snapshots the payload, generates
a UUID event ID and defaults occurredAt to the current time. Call it once per open
and reuse the complete returned object on retries; a fresh visit/reload gets a new
event. `shareAttributionFromParams` explicitly selects recognized URL parameters.
No additional server call is needed to generate event IDs. These are reported
opens, not unique humans, confirmed delivery, referral credit or all page views.

Tokens use the existing `x-share-token` header or `s` query fallback, with the
header taking precedence. Tokens are never stored in share records, open events,
request telemetry or idempotency input digests. The creator must supply a still
valid token when re-resolving a private link; history cannot restore a revoked
link. A deleted/inaccessible resource becomes `resource: null` in the creator's
entry; their stored message remains their historical content. Service metadata
never resolves resource content. Creator account deletion cascades entries and
open events. All responses are private/no-store; cookie POSTs require matching
Origin. Recording/reading never creates an access grant or rotates a token.

### Web flow and extension points

The Share screen performs preview only. With JavaScript and a signed-in session,
Copy link POSTs once with `context.destination: "copy_link"` and an operation UUID, updates
the field with the tracked URL, and copies it. Repeated copies reuse that entry.
Copying a newly generated or rotated collection link uses this same flow with
the collection target and issued token. Each new token resets copy state;
repeated copies of that token reuse its share entry.
Copy link omits the message, so its entry uses the API fallback `Share {kind}`;
the clipboard receives only the URL. Client message templates will be introduced with social actions that actually use them.
A retry after failure reuses the operation UUID. If preparing/copying fails, the
field remains manually copyable. Anonymous and no-JavaScript visitors retain the
ordinary canonical link. Social controls and message editing are deferred.

Resource pages mount an open reporter only after a successful read. It reports
when visible, never during metadata generation or server prefetch. A per-mount
event ID avoids duplicate effect/retry counts; a reload is a new open. The reporter submits recognized UTM values, a client occurredAt and timezone
context; it does not collect arbitrary query parameters, referrer URLs, IPs or user
agents. Analytics failure cannot block reading. No-JavaScript visits are not counted. Return
navigation remains client-owned, validated and contextual. Private collection
sign-in returns preserve a valid `via` and recognized UTM values, so a successful read after login can
report the original share. Manage › Analytics gives operators and admins all-time
service totals and resource/destination breakdowns with a Refresh button and
last-loaded timestamp. It works without JavaScript and does not poll. A personal
analytics dashboard remains deferred; the API supports that client.

Paid API keys, application attribution, quotas/billing, retention/rollups,
fraud-resistant traffic measurement and wider page activity analytics require
separate decisions. Existing authenticated user IDs and explicit resource/scope
boundaries are the foundation; this milestone does not promise a billing-grade
analytics system.

## Interrupted sharing tasks

Sign-in return validation retains the typed Share target (`kind`, immutable `id`,
optional collection token `s`) and a bounded local return path. If a collection
operation returns 401, the web keeps its command and inputs in the existing
15-minute encrypted, account-bound pending-action cookie. Successful verification
replays it only for that account through the API, which checks current permissions.
A resumed link creation or rotation carries its one-time token into the Share
screen so the user can copy it. PUT writes use the same signed per-visitor request
budget attribution as other form mutations.
