# Collections and resources

Status: item APIs, link metadata and Save a link are implemented. Web
section authoring and inline details are implemented; further organization,
preview cards and notes are planned as labelled below. Settled in
[ADR-0007](../engineering-decisions/0007-resolved-titles-read-only-items.md) and
[ADR-0008](../engineering-decisions/0008-references-grant-nothing.md) and
[ADR-0047](../engineering-decisions/0047-owner-scoped-collection-references.md).

## Items and their API

Collections have no structural parent. Resources are ordered rows with versions:

- `POST /collections/:id/resources/external`: canonical HTTP(S) URL, optional
  tags. The title is resolved by the server, never an input. Like Save a link,
  the backend recognizes collection URLs at the configured web origin. A readable
  target in the source's hub becomes a reference; foreign, unreadable, missing
  and self destinations stay ordinary URLs with a generic Collection hint.
  Only `/c/:id` addresses are recognized
  ([ADR-0053](../engineering-decisions/0053-id-only-collection-addresses.md));
  stored references use the immutable ID. Query tokens grant no authority.
- `POST /collections/:id/resources/collection`: `linkedCollectionId`, optional
  tags and position; its title is the target's. Requires source write and target read,
  within the same hub (owner or source contributor). One reference per source/target pair; cycles
  and multiple incoming references are allowed. No copied target title by default.
- `POST /collections/:id/resources/heading`: nonblank `title`, optional plain-text
  `description` (500 characters), `firstItemId` and `firstItemVersion`. Inserts the
  heading before that existing link or reference, shifting subsequent positions
  and versions atomically. A heading creates no access boundary.
- `PATCH /collections/:id/resources/:resourceId`: tags, position and heading-only
  `description`; empty text clears context. To change an address or heading title,
  remove the item and add it again.

A link must be a public web address (`isPublicLinkHost`, shared with the web):
IP literals, single-label, local/internal and reserved example/test names are
refused with `link_not_public`. Recognized application collection routes are
accepted on the configured development origin too, without network metadata
lookups. No extra Add collection control is needed; the API chooses the item kind.

The planned [link-health workflow](link-health.md) adds a narrow approved-redirect
URL update (ADR-0029); ordinary resource edits still cannot change addresses.

## Link metadata

External web links' page metadata — title, description, site name; text only — lives
in `link_metadata`, one row per canonical address, shared by every item that
links to it. Saving a link (Save a link, adding an item, importing) writes a
pending row in the same transaction; the worker relays pending rows to its
`link-metadata` queue, claims each with a lease, fetches the page
(`og:title`/`<title>`, `og:description`/`description`, `og:site_name`; YouTube
and Vimeo through oEmbed first, falling back to the original page when metadata
is unavailable; SSRF-guarded, one 3 s deadline, 256 KB page cap) and marks it ready, or
retries at 1 minute, 10 minutes, 1 hour and 6 hours before marking it failed.
Saving a failed address again retries it; reading a collection re-requests
addresses with no row, failures a day after they gave up, and ready metadata older
than 30 days. Nothing runs under the write lock, and a lookup never changes an
item (no version bump). Items expose `title` (a link's page title, null until
found; a section's text; a readable reference's target title), `description`
and `siteName`. The Save a link title lookup answers from stored metadata first and
stores what it fetches. Imports ignore titles in the source file.

Reference edits, reorders and removal require only source write access. The
viewer-filtered `linkedCollection` payload is `{ id, title }` or null; it never
reveals an unreadable destination's title. Legacy cross-owner references are
unavailable. Collections are independent; references create no structural parent
or inherited grant.

Owners preview `GET /collections/:id/impact?action=delete|transfer` before lifecycle
changes. Deletion removes incoming same-owner references; transfer removes incoming
and outgoing references that would cross owners. The preview lists affected
collections and headings that become empty. Confirmation includes `impactToken`;
changed impact returns a conflict and a fresh preview. APIs may omit the token
only when no references are affected. Cleanup and audit commit with the mutation.
Other collections, ordinary URLs and other items remain. Web forms show **Keep
collection** and explicit confirmation and preserve account-bound commands through
sign-in.
Resources carry no summary; heading descriptions are authored section context. Titles and tags clarify links; headings organize guides.

## Sections (implemented)

Owners and contributors use **Add section** from the collection’s **Edit** page, choose its first
existing item and optionally add a description. **Edit section description**
changes context with version checks and preserves drafts on errors or expired
sessions. A section must contain at least one web link or collection reference;
the backend rejects creation, removal, movement or reordering that would leave an
empty section. Deleting a heading retains its items. See
[ADR-0027](../engineering-decisions/0027-section-context-and-inline-details.md).

Each native disclosure groups the items until the next heading. Section and item
rows use hover/cursor feedback without plus/minus indicators; native keyboard
expansion remains available. Descriptions stay
visible below headings even when the items collapse. Collapsed sections show a
**Show items** cue within the clickable heading area; it disappears when opened
and works without JavaScript. There are no global Expand/Collapse controls.
Reloading restores open sections and opens the item selected in the URL, scrolling
it into view. Collapsing a section with JavaScript clears its selected item.
Only one item can be
expanded at a time. With JavaScript, opening/closing an item updates/removes its
`?item=<id>` URL parameter without a page reload, preserving other parameters.
Direct item links open the item and scroll it into view. Cursor responses include an
optional `meta.section` resource when a page starts inside a section, so native
pagination preserves context without duplicating resources.

**Reorder** on the Edit page opens an owner/contributor list with drag-to-place-before and native
Move up/Move down buttons. Moves save immediately; section moves carry all their
items, including items beyond the visible page. Individual items can move between
sections, subject to the backend's nonempty rule. Compact relative commands carry
source and drag-target versions; expired sessions use account-bound continuation.
Full-order and relative moves advance versions and reject stale submissions.
Clicking non-interactive expanded item content collapses its details; title,
attribution links retain navigation, copy controls remain actionable, and selecting text does not
collapse the item. Native summaries retain keyboard/no-JavaScript toggling.

Reviewed [bulk imports](bulk-import.md) organize folders as nonempty sections
or separate owned collections. Partial commits preserve section and link order.
Targeting a section from Save a link remains planned.

## Preview cards and notes (planned)

Hovering a link (or focusing it; on phones, a details button) shows a card with
the page's metadata: title, domain, site name and the page's description — what
the resource is about. No images or icons. The note (up to 280
characters) is shown in full in the item's details; whether a short version
also appears on the card is decided once the screen is built. The card offers
**View** (details) and, for the owner and contributors, **Edit** (tags, note, section,
remove).

## Item details (implemented)

Link and collection-reference rows expand metadata and attribution inline using
native disclosures. Known contributors appear as **Added by [username]** followed
by the timestamp; the username links to their public profile. The backend records
the actual adding user for new resources. Items predating contributor tracking
can have no recorded author; those show the timestamp alone rather than guessing
from current ownership. Historical credit requires evidence of the original
contributor. Inactive or deleted people are not exposed through this attribution.
Title links open the resource destination. **Copy link to this item** copies
the containing collection address with its token/cursor and `?item=<itemId>`,
without navigating. Success is announced; clipboard failure shows a selectable
URL. The copy label stays consistent before and after hydration. Without
JavaScript, **Open item link to copy its address** is a native permalink. At the
collection ID address, the URL opens authorized item context inline, including an
item beyond the first page. Reloading restores default section visibility and
URL-selected content. See [sharing](sharing.md) for the complete copy contract.

`GET /collections/:id/resources/:resourceId` authorizes the containing collection
first, looks up the item within that collection and hub, and uses the same
viewer-filtered representation as resource lists. An item beyond page one is
read directly. Missing or foreign items return 404; malformed IDs return 400.
Reference destinations are authorized independently, never with the source token.

## Tags

Optional item labels use a normalized-name `tags` catalogue (UUIDv7 identities,
unique names) and `item_tags(item_id, tag_id, position)` assignments. Normalization
trims/collapses whitespace, lowercases, deduplicates and caps item tags at 30 names
of at most 80 characters. The API still accepts/returns names as `string[]`;
database IDs are an internal relationship, never an authorization shortcut.

`collection_tags(collection_id, tag_id, item_count)` stores the unique set used
by a collection's own items. Database triggers update counts with item assignment
inserts/deletes and resource deletion/movement, within the same transaction.
Removing one item's assignment keeps the collection tag while another item uses
it. Collection reads include the stored relation, never aggregate resource pages.
Collection create/update requests cannot set tags. Reference-item tags count;
contents of reference destinations do not. Existing section tags are preserved.

There is no public catalogue/usage endpoint, cross-account autocomplete or tag
hierarchy. Unused catalogue names remain reusable, without exposing previous use.
Authorization still precedes collection/item tag reads. Planned text search can
include these relations. See [ADR-0032](../engineering-decisions/0032-relational-item-and-collection-tags.md).

## First-link capture command

`POST /api/v1/capture` resolves the session owner's immutable hub and atomically
saves 1–2 links (each with optional tags, never a title; canonicalised and
deduplicated, appended in order; links already in the collection are kept
as they are) plus a user-scoped operation receipt, returning the collection
and the resource IDs in input order. A collection it creates takes
`collectionTitle`, or a default "Saved links, <date>" suffixed so it never
repeats a hub title. `GET /api/v1/link-preview?url=` (public, no account required,
own source-based "lookup" budget of 30/min) returns a canonical URL and looked-up title
and validation status for the save form, before and after sign-in. The form shows
only the title and address feedback; richer previews belong on saved collection
items. Lookup failure leaves a valid address saveable with an explanatory message.
The command
uses the existing collection policy and resource canonicalization, and shares
the authority transaction. Its destination is first, new, or an explicit owned
collection ID. First-save concurrency uses a nullable immutable collection ID
on the hub, never a title; only unshared collections matching the intent's publication choice can be
implicitly reused by intents begun before that first collection was created.
Returning intents require a destination choice. Retry receipts recheck current
ownership/access and resource existence; deletion never recreates content on replay.
Receipts retain only IDs, a SHA-256 input fingerprint and creation time, with no
URL or authored text. Receipts have no scheduled expiry or cascading account foreign key. A future
cleanup policy must define the retry/idempotency window; account deletion does
not make a retained receipt authorize access or recreate removed content.

The web retains at most three independent 30-minute AES-GCM draft cookies, each
below browser cookie limits; a draft that would outgrow its cookie drops tags
before any link. Ordinary email verification may submit the pending
capture with the newly issued session; invitation verification is separate.
Auth and capture intentionally commit separately, preserving login on save failure.

## Add to my collection (planned)

The owner has a collection setting allowing or refusing the product's link-copy
action. The backend checks source access and this permission; publication is
not consent. Allowed copies always show a source-collection credit in the
recipient's item list, identified by immutable collection ID. Credit never
bypasses refusal and never grants source access. The initial default and private/
removed-source presentation are implementation decisions for this future slice.
See [ADR-0019](../engineering-decisions/0019-copy-permission-and-source-credit.md).

## Collection tag presentation

The API orders stored collection tags by tagged-item count descending, then by
name ascending for ties. Each item counts once per tag, across every page; usage
in other collections does not affect ranking. The reader shows the first three,
then **+N tags** for the remaining names (**+1 tag** for one). The suffix counts
only tags not already shown; empty collections show nothing. It is supporting
metadata, not a filter. Item rows keep their own tags in their authored order.
The sidebar contains Contributors and Discussion without a separate Tags section.
