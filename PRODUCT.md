# Product Definition

NSLinkHub's canonical product definition (the PRD), written to be understood
without the conversations behind it. Where this document and older material
conflict, this document wins on what the product is and must do;
`ARCHITECTURE.md` and `docs/design-docs/` say how it is built, `DESIGN.md` how
it looks, and `docs/engineering-decisions/` records the settled foundations.

## Register

product

## Product Design Context

### Users And Working Context

A reader arrives through a link or discovers recently updated collections,
understands what a collection covers, then opens a useful resource. An owner
returns to their own hub to save links one at a time, in the middle of other
work, and to share one durable address. A contributor reads or edits one
specific collection; they never join a hub. Typical scene: someone opens a
colleague's collection on a phone beside a bright window, scans several links,
then continues on a laptop.

### Brand Personality

Calm, legible and trustworthy — a dependable personal library. Lowercase
`nslinkhub`, a personal ns-series product under the namestarlit brand.

### Anti-References

- Bookmark dumps: unordered, untitled lists that go stale.
- Invented engagement: counts, decorative covers, recommendations or social
  proof that the data doesn't support.
- Document or course builders with rich editors and uploaded media.
- Cramped, compact forms that save space by dropping labels or crowding fields.
- Team workspaces and organization switchers.

### Product Design Principles

1. Reading earns the most space; titles and destinations are always clear.
2. People type only what they must; the product resolves the rest.
3. UX over compactness: show fewer items rather than crowd a layout.
4. Copy scans at a glance: short paragraphs, emphasis in bold, the reason
   before the action.
5. Every journey works without JavaScript; hidden controls never stand in
   for permissions.

### Accessibility And Inclusion

- WCAG 2.2 AA: keyboard operation, focus visible for keyboard users, reduced
  motion, zoom and reflow, non-color status cues, verified contrast in light
  and dark themes.
- Readable on a phone in daylight and a laptop in the evening (Light, Dark,
  System).
- Labels stay visible; user content wraps rather than overflowing.

## 1. Product Overview

NSLinkHub turns the links people collect into **collections**: ordered,
shareable guides with one stable address. A collection can be read by anyone it
is shared with, published for anyone to discover, followed, discussed, and
downloaded as a document.

```txt
Hub (one per person) → Collections → Items (links, sections, references)
```

The problem it solves: useful links end up scattered across bookmarks, notes
and chat history. Bookmarks are private, unordered and go stale; sending links
one by one loses their order and context, and every update means sending them
again. Instead, a person keeps one living collection and shares its address;
when the collection improves, everyone who has the address sees the
improvement.

NSLinkHub supports free public curation and paid convenience:

- Everyone can create unlimited public collections, share their links, invite
  public contributors, and import bookmarks/CSV for free.
- Private collections have a free owner-only allowance. Paid plans enable private
  sharing and larger private allowances; AI curation and DOCX import are paid
  convenience features (§6.13). Recipients do not need a paid plan.

NSLinkHub is an ns-series product: a personal project under the namestarlit
brand, built to solve its author's own problem and published for others. It has
no company affiliation, and nothing is deployed yet (§11).

## 2. Product Goals

- Saving a link takes seconds and as few inputs as possible.
- A set of links becomes an ordered guide, with sections and references to
  other collections, without becoming a document editor.
- Sharing is one stable address, with access controlled per collection, the way
  Google Drive shares a file.
- What is shared stays current: readers always see the latest version.
- The best collections can be published, discovered, followed, discussed and
  kept.
- Collections can leave the product as Word, Markdown or PDF documents.

### Guides North Star

**Collections as guides, references embedded once.** A collection is more than
a list: it has order, sections, context (notes, discussion) and references to
other collections, so it reads like a guide someone maintains. Every feature
should make a collection more useful to follow, or easier to keep current.

Public-facing copy leads with people's curation: selecting useful resources,
putting them in order, giving them context and keeping them current for a reader.
Fast saving is an entry action. The unit of value is a collection someone can
learn from, work with or share, whether its resources are articles, videos,
tools, references or other collections.

### Free Public Curation, Paid Convenience

New collections default to public, with an explicit private choice. Public
collection count, public sharing and public contributor invitations are free.
Bookmarks and CSV imports are free. A limited allowance of owner-only private
collections is free; private links and invitations require the owner's paid
entitlement for both viewers and contributors. AI curator and DOCX import
(including Google Docs exported as DOCX) are paid features.

This accepted direction supersedes the conflicting portions of ADR-0016; see
[ADR-0028](docs/engineering-decisions/0028-free-public-curation-paid-private-sharing.md)
and [monetization](docs/design-docs/monetization.md). Prices and private allowance
counts remain open. Billing, quotas and the public creation default are not yet
implemented; existing development collections are never automatically published.

## 3. Target Users

### Everyday Owner

Anyone with a hub (the author is user zero). Collects resources on topics they
care about, usually one link at a time in the middle of other work, often on a
laptop.

Needs:

- Save a link quickly into the right collection.
- Organize collections into guides and keep them current.
- Share or publish the good ones; manage who has access.
- Find again what they saved, shared with them, or followed.

### Contributor

Someone the owner granted Can contribute on one collection (`contributor` in the
API). They act as a person;
collaboration requires no hub membership or hub of their own.

Needs:

- Add, organize, annotate and remove items in that collection.
- Moderate its discussion.
- See nothing else of the owner's hub.

### Reader

Opens a collection someone sent, shared or published — with or without an
account — and discovers more through Discover and hubs they subscribe to.

Needs:

- Understand what a collection covers and open the right resource.
- Ask questions and get answers in the discussion.
- Subscribe to hubs, save collections, and find them again later.

### Professional Curator

People for whom links are the work: educators and researchers managing a
digital library of links; people running a link-heavy learning program or a
community whose members get a guide of the best resources (today, a Google Doc
sent to every new member); the person who keeps a community group supplied
with links; people gathering resources from the open web at scale (scraping,
crawling, research datasets).

Needs (planned, through a Curator account):

- See how their collections are used: views, link clicks, saves, subscriptions.
- Give members-only access to their best collections.
- Bring in and keep large libraries healthy: bulk work at scale, dead-link
  alerts, AI curation.
- Integrate through the API, with rate limits that fit their work.

### Service Operator And Admin

Separately invited people who keep the service healthy: account restrictions,
holds on public content, the operator team and the service audit. They never
see private content.

## 4. Success Measures

Proposed signals, not targets; there is no usage data yet, and none is
invented here.

- A first link is saved in the first visit.
- People return to collections shared with them (returning readers).
- Collections get shared, published and followed.
- Owners keep collections current (items added or changed after the first
  week).
- Professional curators would pay for the Curator account (validated with a
  few hand-picked curators before self-serve).

## 5. Hubs, Ownership And Access

### Hub Model

A **person** (the account) has a **username** and a name. Their **hub** is
their publishing space — like My Drive in a Google account, or a channel on
YouTube — with its own **name**, optional **description** and **@handle**
(ADR-0018). A person has at most one hub, created explicitly or when they first save a link
or start a collection; someone who only reads or contributes by invitation
needs none. Collection bookmarks belong to the person and require no hub. Imports
require an existing hub and owner authority; they never create a hub. The account
menu always offers Hub, with explicit creation when absent. The hub owns every collection in it and its subscribers, and is the
face wherever those appear: its page reads "Hub name" over "@handle", or
"@handle by Owner Name" when the owner shows their name. People act as
themselves — commenting, contributing, invited by email — and appear by their
username. Hubs live at `/@handle` and people at `/username` (separate
namespaces; the app's route words are reserved). Permanent identities are
immutable ids, so renaming breaks no link. A hub is never transferred (its
owner's fingerprint); collections are. Others **subscribe** to hubs; people
aren't followed. No memberships or organizations (ADR-0017, rejected).

### Collections And Items

A **collection** is an independent container with a title, description, tags,
sharing, publication and discussion. Collections never nest; one collection
can only *reference* another. Its **items** are ordered; an item's kind is
decided by how it was added, never by inspecting a URL:

- **Link**: a public web address. Its title comes from the page and is never
  typed.
- **Section** (a heading): a text label that groups the items below it,
  without creating a separate collection or permission boundary. Optional plain-text
  context is limited to 500 characters; every section has at least one web link
  or collection reference.
- **Collection reference**: points to another collection by its permanent id,
  possibly in another person's hub. Whoever adds it must be able to read the
  target; references can be reused and may form cycles. It grants no access:
  readers who couldn't open the target anyway see a neutral "unavailable"
  entry, without its title. Pasting a collection's address creates an
  ordinary link, never a reference.

**Tags** are optional item labels (`video`, `free`, `must-read`), normalized
when saved (lowercase, de-duplicated, capped). A shared `tags` catalogue stores
unique names; `item_tags` assigns them to items. `collection_tags` stores the
unique set used by a collection's own items and stays synchronized transactionally.
Collection tags are read-only, never independently authored. No public catalogue,
autocomplete pool or hierarchy is exposed; reference targets are not traversed.

**What belongs to an item stays as saved**: a link's address and its title, a
reference's target, a section's text. People change only what they add to it
(tags, order, section, note). A wrong link is removed and added again.

### Roles

Roles come in two separate scopes (ADR-0013):

| Role | Scope | Can |
| --- | --- | --- |
| Owner | Their hub and every collection in it | Everything |
| Contributor — "Can contribute" | One collection | Change its content; never publish, share or delete |
| Viewer — "Can view" | One collection | Read |
| Operator, Admin | The service (`/manage`) | Run the service; never read private content |

Contributors and viewers are a collection's **collaborators**, invited by name;
unlike a share link, their access can't be forwarded.

Per collection, everyone who can change its content is a **contributor** (the discussion
badge, attribution). The collection's **creator** is a record of who created
it, kept through transfers, never a role. "Curator" names the professional
account type, not a role.

### Backend Authority

The API decides every rule, permission and derived state; the web and the
browser extension are replaceable surfaces, and hidden controls are never a
permission. Access to a collection resolves per collection, strongest first:
owner → direct share → active share link → published. Anything else is "not
found", so private collections can't be probed.

## 6. Core Functional Modules

Status per module: **Built** (web and API), **API only** (built and tested in
the API, no web screens yet), or **Planned**.

### 6.1 Saving Links

Purpose: get a link into the right collection in seconds. Status: Built.
The current private creation default is superseded prospectively by ADR-0028:
new collections will default to public with a visible private choice; this rollout
is pending and must cover first-save, native forms and API defaults together.

- **First link (signed out):** the home page's main action is **Save your
  first link**. The person pastes one or two links (tags optional), then
  verifies their email with an eight-digit code — it is sign in plus add the
  link. Sending a code creates nothing; verifying signs them in (creating the
  account if new) and saves the links: with no hub yet, the hub is created on
  the spot with a new collection (currently private) named with the date ("Saved links,
  7 Oct"); with a hub that has collections, they choose where the links go.
  Existing accounts are never turned away. Saving is atomic and safe to retry;
  no profile, title or handle setup comes first. Ordinary **Sign in** never silently
  creates an account. Explicit account creation offers an optional named hub, off
  by default; otherwise ownership can create it later (ADR-0044).
- **Save a link (signed in):** always in the header. One or two links per save;
  each address turns blue when it is a valid public link and red when it isn't,
  and shows the page's title once found. Tags are optional, behind **Add
  tags**, shown as pills. The destination is an existing collection (each shows
  when it was last updated) or a new one, prefilled with a name that never
  repeats; adding to a published collection is always an explicit choice.
  Repeats, non-addresses and domains that don't exist are refused before
  saving; a real site with no title is still saved. The form fits a 14-inch
  laptop screen in at most eight actions; more than two links is bulk work
  (**Bulk import links**, §6.2).
- Both first-link and signed-in forms resolve the page title and validate the
  public address before saving. This is a lightweight title/status check;
  richer previews belong on collection items (§6.4), not in the add-link form.
- Saved links must open for everyone they're shared with: localhost, loopback
  and IP addresses, local/internal names and names reserved for examples and
  testing (`example.com`, `.test`, `.invalid`, …) are refused.
- Addresses are canonical (lowercase scheme and host, normalized path, sorted
  query, tracking parameters such as `utm_*`, `fbclid`, `gclid` removed), so the
  same link is one item per collection.
- **Add to my collection** *(planned)*: from a link's details, Save a link opens
  with the address filled in — a quick save into one of your collections.
- The browser extension *(planned)* saves the current tab into a chosen
  collection.

### 6.2 Bulk Import

Purpose: bring an existing library in, reviewed before it lands — Save a link
at scale. Status: Planned (today the API imports in one shot);
design: `docs/design-docs/bulk-import.md`, ADR-0012.

- Owner-only: an existing personal hub is required. The import page prompts
  explicit hub creation when absent; the API never creates a hub during import
  and rejects imports into collections the caller does not own.
- Sources: a browser bookmarks file, one documented CSV layout (`url`,
  optional `tags`, optional `folder`), or a pasted list. Only the link and its
  destination are needed; a title in the file is a hint for human readers and is
  ignored — everything about the page is fetched from the link.
- Everything becomes a **draft** first. Titles resolve from the pages like any
  save (source titles are ignored); each row shows Ready, Failed with a reason,
  Duplicate or Already saved, with a summary and filters.
- Failed rows are fixed in place (re-checked), revalidated or dropped.
- Folders become sections of one collection, or split into separate
  collections chosen per folder (new, existing, section of the parent, or
  skip).
- **Import N ready links** commits the ready rows; the rest wait in the draft
  until fixed or dropped.
- Limits: 1,000 links and 10 MB per draft, 3 open drafts, 30-day expiry.
- Lives in Manage › Import & export (§6.9).

### 6.3 Collections And Guides

Purpose: read and keep a collection current as a guide. Status: reading,
details, attribution, section authoring and reordering Built.

- A collection page shows its title, description, tags, owner and last update,
  then its items in order. Missing titles are resolved when it is opened.
- The header shows **Share**, plus **Edit** for owners and contributors. The
  viewer’s main actions are Share and Add a comment; items and sections toggle
  directly, without a global expansion toolbar.
- **Edit** brings together collection details (owner only), the owner's **Add a
  link** flow, section descriptions and creation, reordering, and a secondary
  **History** link. Content tools follow backend capabilities; contributors
  cannot change owner settings.
- Sharing uses the common sharing page. The right column shows Contributors
  above Discussion, independently of the collection header while scrolling. The
  header shows up to three collection-tag chips, ranked by the number of items
  using each tag (highest first, alphabetical ties), then **+N tags** for the remaining
  stored tags; empty collections show no tags.
- **Sections**: **Add section** starts at an existing item; owners and contributors
  can add or edit its optional description. Descriptions stay visible when sections
  collapse. Sections and link details expand inline, without dialogs. Reloading
  opens sections by default and restores the item selected in the URL in view.
  Only one item is expanded at a time; its ID stays in `?item=<id>`, and direct
  item links open and scroll to the item. Backend rules prevent empty sections.
  **Reorder** lets owners and contributors drag items or use Move up/Move down;
  moves save immediately, and moving a section carries its items. Expanded item
  bodies toggle on click while links retain navigation and text stays selectable.
  Planned: target "Collection › Section" from Save a link.
- Reorders and edits use version checks; a stale edit is rejected, never
  silently overwritten.
- **Attribution** (ADR-0015): like commits and contributors on
  GitHub, every change is recorded as "who did what to which item". The
  collection shows its **creator** and a **Contributors** section with usernames
  and a total; expanded items credit their adding username and timestamp; contributors can open
  the collection's history.

### 6.4 Link Previews And Notes

Purpose: tell similar links apart and give them context, without leaving the
collection. Status: link metadata Built (the worker looks it up; the web shows
titles and item details); preview cards and notes Planned.

- **Link metadata:** each link stores its title, description and site name,
  looked up in the background. Text only: no images or icons are fetched or
  stored, so viewing a collection never contacts the linked sites.
- **Preview card:** hovering a link (or focusing it; on phones, a details
  button) shows the title, domain, site name and the page's description — what
  the resource is about, like a link card in Google Docs.
- The card has at most two actions: **View** (anyone who can read) opens the
  item's details, which have their own address and work without JavaScript;
  **Edit** (contributors) opens the item's edit form — tags, note, section,
  remove.
- **Note:** up to 280 characters of context a contributor writes about a link —
  why it's here, what to look for. Readers see it in full in the details;
  whether part of it shows on the card is decided once the screen is built.

- **Add to my collection (planned):** the source collection owner controls whether
  people may copy its links through this action. Read access alone is insufficient.
  Every permitted copy displays credit linking to its source collection in the
  destination's item list. Credit never overrides the owner's refusal. See
  [ADR-0019](docs/engineering-decisions/0019-copy-permission-and-source-credit.md).

### 6.5 Sharing And Access

Purpose: give exactly the right people access to one collection. Status: API
only; access requests and targeted invitations Planned.

Planned commercial boundary (ADR-0028): public links and contributor invitations
are free. Private access links and invitations to either viewers or contributors
require the owner’s paid entitlement. Free private collections are owner-only.
Changing a public collection to private must not retain contributor access as a
way around the paid requirement. Entitlements are not yet enforced.

- **Link sharing:** anyone with the link can read; the owner can rotate or turn
  it off, cutting off link-based access immediately. Signed-in people who open
  it find the collection under Shared with me while the link stays on.
- **Direct sharing:** to an account by email as Can view (default) or Can contribute,
  independent of the link and individually revocable. This is the only
  collaboration mechanism.
- **Targeted sharing by invitation** *(planned)*: sharing with an email address
  that has no account sends an invitation; the share activates once the person
  verifies their email and has an account. Reading without an account works
  through link sharing and publishing, as in Google Drive; a targeted share
  needs an identity to authorize.
- **Publishing:** the collection appears on Discover and its hub's public page.
  Publication, like every grant, applies only to that collection; referenced
  collections need their own.
- **Request access** *(planned)*: signed-in people who can't open a collection
  can ask for Can view or Can contribute; the owner answers in Manage › Access. The
  request always reads "sent", so it never reveals whether a private
  collection exists.
- **Transfer:** a collection moves to one of its contributors' hubs; references are
  untouched, the previous owner becomes a contributor, the creator stays on
  record. Hubs are never transferred; the chosen account email is fixed. The optional-hub design must handle a recipient without a
  hub when collection transfer is implemented against it.

### 6.6 Discover, Subscriptions And Your Home

Purpose: find good collections and come back to them. Status: Discover Built;
saves API only; subscriptions and home tabs Planned
(`docs/design-docs/hub-home-and-following.md`).

- **Discover** lists published collections, newest first, page by page. Search
  by text and tags, tag filters (popular tags from published collections over
  the last 90 days) and full-text search are planned; no date-range filter.
- **Public hub page:** the hub's name, handle, description, the planned **Subscribe** action, and
  published collections. The contextual Share page is implemented for hubs,
  profiles, collections and the site, with site sharing in the footer. Planned
  hub counts prioritize subscribers and total collection saves: readers saving
  curated collections to return to. Individual resource copies are a separate
  action and do not contribute to collection-save counts.
- **Subscribe** to a hub like subscribing to a YouTube channel: it joins your
  Subscriptions list, its new published collections appear there, and you're
  notified when it publishes (a per-hub notifications toggle, on by default).
  A person subscribes to the hub’s immutable ID; the subscription survives
  name and handle changes. Hubs never change owners.
- **Save** a published collection like saving a document in Google Drive. If
  it is unpublished, the save goes dormant — it keeps its place labelled
  "Currently unavailable", can't be opened or downloaded, can be removed, and
  no snapshot is kept — and comes back when it is republished.
- **Your home:** your own hub page, Google-Drive style — **My collections**,
  **Shared with me**, **Saved**, **Subscriptions**. Settings offers "View your public hub".

### 6.7 Discussion

Purpose: questions and answers next to the resources. Status: Built.

- Every collection can carry a discussion: questions or notes with one level of
  replies, readable by anyone who can read the collection.
- Anyone signed in who can read it can comment and reply, so help never waits
  on the contributors; signed-out readers are invited to sign in.
- Contributors' replies are badged **Contributor**; they can mark one reply per
  question as the answer (shown first) and hide comments (still visible to
  them). Each question shows up to 100 replies, with **More replies**.
- Authors edit or delete their own comments; a question with replies keeps a
  placeholder.
- The owner can turn comments off, leaving existing ones readable; a collection
  on hold takes no new comments. Comments never grant access to anything.

### 6.8 Notifications

Purpose: one inbox for everything that concerns you. Status: invitation
notifications Built; the rest Planned (`docs/design-docs/notifications.md`).

- Kinds, scoped by role: subscriptions (a subscribed hub published), comments, saves
  and subscriptions to your hub, sharing, invitations, imports, and service notices
  for operators.
- **Settings › Notifications** at `/settings`: a switch per kind and per subscribed
  hub; invitations and security notices are always on.
- Notifications are in-app. Email is kept for sign-in codes, invitations,
  targeted shares and security notices.

### 6.9 Manage

Purpose: one workspace (`/manage`, ADR-0014) for owners, operators and admins,
with sections and actions determined by their capabilities. The shared shell,
owner Collections/Access/Audit and service controls (§6.12) are built.
See `docs/design-docs/manage-workspace.md` for implemented and planned sections.
Accounts is service-wide; Access is the owner's current collection access list.
Profiles, hubs, collections and the site use one contextual Share page with Copy link and durable ID addresses. A shared API resolves addresses/access and creates entries with default or custom plain-text messages and optional structured creation context. Authenticated Copy link returns a `via`-tagged address; successful client loads report idempotent opens with forgiving optional attribution/context and a client occurrence time. New opens return 201, retries 200; metadata warnings do not prevent recording. Creator activity, resource-owner aggregate analytics and admin service metadata have separate API boundaries. Counts represent share requests and reported opens, not confirmed delivery or unique people. Manage Analytics is available to operators and admins, with all-time service share/open totals, resource/destination breakdowns and manual Refresh. Social destinations, personal analytics dashboards and paid API credentials remain deferred.

Collections and Audit Log each use one permission-scoped view without My hub / Service tabs. All audit events share one AuditLog model (ADR-0024).

Further owner capabilities:

- **The owner:** **Collections** (all collections as a table),
  **Comments** across the hub (hide, show, mark answers), **Access** (access
  requests, every share, link-shared collections; each collection's Manage
  access opens it filtered), **Invitations** (send and track collection-access
  invitations), **Access** (accepted collaborators and their granted access,
  subscribers and blocked accounts),
  **Import & export**, and **Activity** — the hub's audit trail.
- **Blocking** happens where a person appears — a comment, a subscriber, an
  access request, a share — and is undone in Access. A blocked account can't
  comment, subscribe, be shared into or open link-shared collections; published
  collections stay public to everyone.

### 6.10 Download And Export

Purpose: take a collection out of the product as a document. Status: API only.

- Like File › Download in Google Docs, a signed-in reader can **Download** a
  collection as Word, Markdown or PDF; several collections at once (one
  document each, zipped) are exported from Manage › Import & export.
- The title and description lead, sections become headings, and references stay
  links unless the reader asks to include readable referenced collections one
  level deep — an expanded guide.
- Nothing is fetched from linked pages and nothing is stored. Unavailable
  references get a generic notice that reveals no title or content.

### 6.11 Account And Sign-In

Purpose: one account, passwordless, that never loses what you were doing.
Status: sign-in, verification, settings, editable hub handles and
self-service account lifecycle, public Gravatar avatars and passwordless security Built; controlled email change is backlog.

- **Sign-in and signup:** Separate `/sign-in` and `/sign-up` pages share email-first
  authentication, with Continue with Google secondary (ADR-0044). Sign-in reads
  **Sign in to nslinkhub**; signup reads **Create your account**. Account absence
  is disclosed only after proof. A missing account requires explicit Create account;
  sign-in offers Use a different email, signup offers Already have an account? Sign in.
  Verified email proof is reused without another code. Creation offers optional
  **Start with a hub**, unchecked by default, requiring a hub name when selected.
  The backend creates account and hub atomically and assigns a common initial
  username/handle available in both namespaces; both remain editable under their policies. After entering an
  email, an existing user can use a registered passkey without email or TOTP
  codes. Otherwise, verify an eight-digit emailed code. Google callback alone never
  creates an account: if its email has none here, explicitly offer to create one,
  show the email and offer explicit creation or a return to sign-in.
  Confirmation then creates the account from Google's verified email and name,
  connects Google and signs in atomically, without a second inbox code or separate
  linking workflow. The backend resolves Gravatar from the verified email.
  Existing accounts connect Google within sign-in; Settings is optional.
  Invitations retain their own email-code verification. Save your first link goes
  directly through the shared email-code screens and resumes the saved link
  afterwards, without Google or standalone passkey choices.
  Emails carry codes only; neither passwords nor usernames are login credentials.
- **Account security:** optional passkeys and authenticator-app TOTP in Settings.
  After either is enrolled, email and Google require a registered factor or
  single-use recovery code. A user-verified passkey completes sign-in directly.
  Recovery keeps protection enabled; recent completed authentication is required
  to add/remove methods or replace recovery codes. See
  [passwordless security](docs/design-docs/passwordless-security.md).
- **Verification:** every situation that sends a code uses the same two
  screens, worded for the purpose (sign in, first link, signing in to do
  something, a session that ended mid-action, confirming a sensitive action,
  accepting an invitation). A known address is shown, never asked for again;
  nothing is emailed until the person chooses **Send code**; codes pasted with
  spaces or dashes work. An interrupted action continues afterwards, only for
  the person it belongs to.
- **Settings:** username, full name, email and member-since; optional hub name,
  handle, description and permanent id; whether to publicly connect the person profile and hub. Profiles show name, username and an optional personal bio (up to 500 characters),
  independent of the hub description. A missing hub is explained with a first-save action. Changes
  save as they are made. Timezone defaults to Automatic (the device); an explicit
  choice is stored on the account and follows it across devices, including initial
  server-rendered dates and calendar filters (ADR-0045). Appearance (System, Light, Dark) is a header control.
- **Account identity:** user UUID and the chosen email are fixed. Profile updates
  can change names and bios, never identity fields. Controlled email change is
  backlog (ADR-0041): any future process requires a dedicated POST action with
  identity proof and relevant owner/operator notifications, not ordinary PUT/PATCH.
  A separate account gets its own identity and does not inherit access.
- **Profile avatars** *(Built)*: use Gravatar, falling back to our
  existing generated icons when no image is available or the provider fails.
  Profile Settings links to picture instructions on Support, without a picture
  preview. Gravatar is optional; no Gravatar account is required to use the product.
- **Hub handles:** owners can change the handle and name as the hub's purpose
  evolves. Shared links keep using the stable hub ID. Issued spellings remain
  retired forever once replaced, including for the same owner. Changes require
  30 days between successful renames; the initial generated handle can be
  customized immediately (ADR-0043).
  Usernames and display names remain freely editable within their validation rules.
- **Account deactivation:** email-confirmed, reversible, no automatic deletion.
  Hide the profile and owned collections from everyone, revoke sessions/privileges,
  retain data. Explicit email-confirmed reactivation restores content; sign in anew.
  Signing in or saving a link with an eligible inactive account leads, after email
  proof, to exactly the applicable reactivation or deletion-cancellation action.
  Ordinary sign-in shows no generic recovery link; the saved destination survives.
- **Account deletion:** a separate email-confirmed action with a 14-day grace
  period and export/transfer advice. Cancellation keeps the account inactive.
  Final cleanup removes the hub and owned collections, anonymizes contributions,
  and permanently reserves the hub handle. Self-service never lifts operator restrictions.
- **Single sign-on** *(planned)*: one account across ns products through the ns
  series' own centralized identity service. Authenticator-app codes are a later
  option.

### 6.12 Service Operations

Purpose: keep the service healthy without access to private content. Status:
Built.

- Operator and admin roles are granted only by invitation. The first admin is
  invited at startup; only admins invite or remove operators. A new recipient
  enters their name and accepts before any account is created, and every
  recipient — even one already signed in — verifies a fresh email code before
  the role activates. No first-user, email-domain or single-sign-on shortcut
  grants a role; changing the account's email removes both roles.
- Suspension blocks the account's sign-in and others' access to its content;
  reactivation allows a fresh sign-in and restores sharing except where a
  collection is held. A hold keeps a public collection available to its owner
  for correction but hidden from everyone else; only operators release it.
- Every action carries a reason and is audited with its effect; sensitive
  actions ask the operator to confirm it's them with a fresh code. Operators
  never see private content, impersonate anyone, edit credentials or delete
  accounts. Contract: `docs/design-docs/service-operations.md`.

### 6.13 Curator Accounts

Purpose: charge for private collaboration and additional curation convenience.
Status: accepted direction, not built; “Curator” is a working plan name, not a
professional-only eligibility rule. Contract: ADR-0028 and
[monetization](docs/design-docs/monetization.md).

- **Free:** unlimited public collections, public link sharing and contributor
  invitations, bookmarks/CSV import, and a limited owner-only private allowance.
- **Paid private sharing:** the owner can enable private links and invite viewers
  or contributors. Invitees need no paid plan and retain normal collection roles.
- **Private capacity:** larger paid allowances; exact free/paid counts remain open.
- **AI curator:** paid suggestions for collections, sections, tags and context,
  with explicit review before commit; titles still come from the pages.
- **DOCX import:** paid extraction of resource documents, including Google Docs
  exported as DOCX, into reviewed drafts. AI grouping is an optional paid step;
  deterministic DOCX extraction is also paid. A direct Google connector is separate.
- **Link-health monitoring:** paid background checks with updates when links become
  unavailable or recover. Redirects are brought to the owner for approval before
  updating the saved address, with a required note explaining the change. Only
  the dedicated review-approval workflow can update URLs; generic PUT/PATCH cannot. See
  [link health](docs/design-docs/link-health.md) and ADR-0029 (planned).
- **Richer Gravatar profiles** *(planned)*: optional profile information beyond
  avatars for paid users. Select fields and define consent, refresh and backend
  entitlement rules before implementation; ordinary avatar integration comes first.
- **Further candidates:** aggregate analytics, scoped/revocable API
  credentials and richer curator presentation. Selling access to content is a
  separate uncommitted idea, not the meaning of paid private sharing.

New committed collections default to public with the private choice visible before
submission. Drafts remain private; existing destinations keep their visibility.
The backend must enforce quotas and owner entitlements across invitations, links,
publication changes, transfers and expiry. No quota or billing event silently
publishes or deletes existing private content. See [assisted curation](docs/design-docs/ai-curation.md).

## 7. Technical Product Requirements

### Web Application

The complete product surface: every module above. Native form posts work
without JavaScript, which only enhances. The interface follows `DESIGN.md`
and `docs/design-docs/web-interface-system.md`.

### Browser Extension

A planned, narrow capture companion: sign in, pick a collection, save the
current tab or selection (popup, context menu, keyboard shortcut) through the
same API as Save a link. No management screens.

### API Clients

Browsers use cookie sessions; API clients and the extension use bearer tokens.
Every client goes through the same authorization; Curator API keys (planned)
are scoped, revocable and rate-limited per plan.

### Privacy

- Email addresses are never public. People appear
  by username, with names on profiles and an optional public connection to their hub. Invited
  collaborators’ email addresses are visible only in the owner’s access list.
  Person references use immutable user IDs and current usernames (ADR-0018).
  Usernames are stored lowercase (3–20 ASCII letters/digits, single internal
  hyphens); case and hyphens never distinguish availability. Dots are invalid,
  and app names such as `share` reserve every hyphen variant (ADR-0026). Overlong
  drafts can receive a backend-checked shortening suggestion with a four-character
  hash suffix; users explicitly accept it before saving.
- Saved links must be public addresses; link previews are text only and never
  make readers' browsers contact linked sites.
- Activity records hold ids, never names, emails or authored text.
- Analytics (planned) count in aggregate, never per reader.

### Auditability And Retention

- Every change to a hub's content and settings is recorded as an activity
  entry under the attribution contract; every operator action is
  audited with its reason.
- A complete audit logging strategy and redesigned audit experience are deferred
  to their own milestone after fundamental operations. Existing recording and
  History remain in place; they do not imply a complete audit system. Wide event
  logging has a separate later milestone (§11;
  [ADR-0020](docs/engineering-decisions/0020-logging-after-core-operations.md)).
- The interim [core audit slice](docs/engineering-decisions/0021-bounded-audit-effects.md)
  captures publication, share-link, direct-access and transfer state changes and
  distinguishes no-op commands. The audit reader shows recorded effects/results;
  older entries retain unknown details. Full audit strategy remains deferred.
- Import drafts expire after 30 days; account deletion has a 14-day grace
  period; exports are never stored.

## 8. Acceptance Criteria

- An unpublished collection is invisible to strangers: not on Discover, not on
  the hub page, "not found" to direct requests.
- A share-link reader can read but never write; rotating or disabling the link
  cuts off link-based access immediately.
- A direct-share contributor can change items and tags in that one
  collection, and cannot import, publish, manage sharing, delete it or see anything
  else in the hub.
- Saving a collection requires it to be published; the save survives
  unpublishing (dormant) and comes back on republish.
- Each person owns at most one hub, created explicitly or on first ownership
  (not sign-in or import), with a unique handle; never derived from their email.
  Owners can rename handles once every 30 days; retired spellings are never
  reusable by anyone, including after deletion. Durable links use permanent ids and survive hub-name,
  handle or collection changes.
- Tags use a unique normalized-name catalogue and item assignments. Collection
  assignments are the stored union of their own item tags, maintained in the same
  transaction as item changes. A link keeps one canonical address, at most once
  per collection.
- Guides use ordered sections with optional descriptions of at most 500 characters;
  each section contains at least one web link or collection reference.
- Stale reorders and edits are rejected (409) instead of overwriting concurrent
  changes.
- Malformed import rows produce per-row errors, never silent partial
  corruption.
- A link's title is never an input when saving or editing; its address, title,
  target or section heading never changes after saving. Section descriptions are
  editable context (ADR-0027). The planned owner-approved redirect workflow is the
  sole URL-update exception (ADR-0029), requiring a recorded explanation; generic
  PUT/PATCH URL editing stays unavailable.
- References never inherit direct shares, link access or publication. A contributor
  can reference any collection they can read, then tag, reorder or remove the
  reference without access to its target. Deleting the target leaves a neutral
  unavailable entry; deleting or transferring a source never affects its targets.
- Export expansion is one level deep and separately authorized, so cycles can't
  recurse and private content can't leak.
- Verification sends nothing until the person chooses to; an interrupted action
  continues after verification only for the account it belongs to.
- Suspended sessions are denied and held content is restricted on every read,
  list and export path. Operators gain no private-content access; actions and
  their audit commit together; recovery never revives old sessions or role
  grants. Invitation acceptance starts from the emailed link, creates an
  account only with explicit consent, and grants no role until a fresh,
  invitation-bound email code is verified. Sensitive actions need recent completed
  authentication; enrolled protection applies after the invitation email code.

## 9. Out Of Scope

- Mobile apps.
- Authored rich content, a document or course builder, and uploaded or hosted
  media. A collection is a description plus sections and links; media is
  linked (an unlisted video, a recording), never uploaded. A course builder
  would need an editor, storage and teams, which the individual-scoped ns
  series deliberately excludes.
- Organizations, teams and hub memberships (ADR-0017, rejected). Collaboration
  is per collection; GitHub-style organizations only if ever needed.
- A separate saved-items list: reusing someone's link is Add to my collection.
- Billing, until Curator accounts are built and priced.

## 10. Open Product Decisions

- **Prices and allowances:** free/paid private-collection counts, billing cadence,
  AI/DOCX budgets, monitoring cadence/allowances, final paid-plan naming and provider selection.
- **Lifecycle:** grant suspension/revocation, grace periods, transfers and
  over-limit behavior on downgrade, plus failed/partial-job charging.
  Free/paid boundaries and public creation defaults are settled by ADR-0028;
  track delivery in the [curation backlog](docs/backlog/curation-and-paid-services.md).

Decisions already made live in their module above, in the design docs, and in
`docs/engineering-decisions/`.

## 11. Delivery

Nothing is deployed; everything built runs and is verified locally. The API
(NestJS, `/api/v1`) is the product authority.

| Module | Web | API |
| --- | --- | --- |
| 6.1 Saving links | Built | Built |
| 6.2 Bulk import (reviewed drafts) | Planned | One-shot import built; drafts planned |
| 6.3 Collections: reading, details | Built | Built |
| 6.3 Section authoring and descriptions | Built | Built |
| 6.3 Item reordering | Built | Built |
| 6.3 Other item organization and references | Not yet | Built |
| 6.3 Attribution and history | Built | Built |
| 6.4 Link metadata (title, description, site name) | Titles and inline details | Built |
| 6.4 Item details routes | Built | Built |
| 6.4 Preview cards, notes | Planned | Planned |
| 6.5 Sharing, publishing, transfer | Built | Built |
| 6.5 Access requests, targeted invitations | Planned | Planned |
| 6.6 Discover | Built | Built |
| 6.6 Saves, shared with me | Not yet | Built |
| 6.6 Subscriptions, your home, search | Planned | Planned |
| 6.7 Discussion | Built | Built |
| 6.8 Notifications | Invitations only | Invitations only |
| 6.9 Manage | Core built; extensions planned | Core built; extensions planned |
| 6.10 Download and export | Not yet | Built |
| People and hubs: usernames, profiles, optional hub | Built | Built |
| 6.11 Sign-in, verification, settings | Built | Built |
| 6.11 Controlled email change | Backlog | Backlog (old API retired) |
| 6.11 Handle changes (30-day cooldown, no retired-handle reuse), account lifecycle | Built | Built |
| 6.11 Gravatar profile avatars | Built | Public active-account proxy and generated fallback built |
| 6.11 Single sign-on | Planned | Planned |
| 6.12 Service operations | Built | Built |
| Audit strategy and redesign | Deferred milestone; current views provisional | Existing records retained; strategy deferred |
| Wide event logging | Deferred milestone | Request telemetry foundation built; domain strategy deferred |
| 6.13 Curator accounts | Planned | Planned |
| Browser extension | Planned | Uses the existing API |

Public person pictures use the backend Gravatar proxy with generated fallback;
see [identity and handles](docs/design-docs/identity-and-handles.md#profile-pictures).
Richer Gravatar profile display remains a later paid feature, with fields and
entitlements still to be designed.

Delivery sequence and remaining work (completed foundations are marked):

1. **Link metadata foundation** — done
   ([deliver-link-metadata](docs/exec-plans/completed/deliver-link-metadata.md)):
   background lookups in the worker, title, description and site name stored
   once per address. Bulk import and previews build on it.
2. **Activity and attribution** (§6.3) — done
   ([attribution-and-activity](docs/design-docs/attribution-and-activity.md)).
3. **People and hubs** — done: separate usernames/person profiles and optional
   hubs created explicitly or on first ownership, with independent names and @handles
   ([people-and-hubs](docs/design-docs/people-and-hubs.md)). Subscriptions remain
   in the home/subscriptions slice below.
4. **Collaborators and routes** — done: collection roles are **viewer** and
   **contributor**; items open by `?item=<id>` on either collection address,
   including native links and authorized reads beyond the first page.
   [Implementation and verification](docs/exec-plans/completed/deliver-collaborators-and-routes.md).
   Preview cards, notes and item editing remain in their later milestones.
5. **Manage** for the hub owner (§6.9) — core built; remaining extensions in
   [manage-workspace](docs/design-docs/manage-workspace.md).
6. **Bulk import** (§6.2) —
   [deliver-bulk-import](docs/exec-plans/active/deliver-bulk-import.md).
7. **Notifications** (§6.8) —
   [notifications](docs/design-docs/notifications.md).
8. **Your home and subscriptions** (§6.6) —
   [hub-home-and-following](docs/design-docs/hub-home-and-following.md):
   subscribers, collection bookmarks/saves and meaningful hub engagement counts.
9. **Link previews and notes** (§6.4), with Add to my collection.
10. **Remaining web organization and downloads** (§6.3, §6.5, §6.10) —
    item/reference editing and export. Sections, reordering, contextual sharing,
    publishing and transfer are built. Social destinations remain deferred;
    site sharing lives in the footer.
11. **Discover search** (§6.6).
12. **Rest of the internals pass** — fewer queries, one write-lock opt-out per
    controller, the forms route as an action table, Save a link drafts in
    Redis, focus rings.
13. **Account** (§6.11) — controlled email change is backlog; standard profile edits exclude email and user UUID. Passkeys, confirmed Google onboarding/sign-in, authenticator-app codes and protected recovery are built.
    Hub-handle changes with a 30-day cooldown and permanent retirement are built
    (ADR-0043). Self-service deactivation/recovery and deletion/cancellation are
    built (ADR-0033/0040).
14. **Browser extension** (§7).
15. **Targeted sharing by invitation** (§6.5).
16. **ns-series single sign-on** (§6.11) — `docs/design-docs/identity-sso.md`.
17. **Audit logging strategy and redesign** — dedicated milestone after the
    fundamental product and service operations above are complete. Start from
    investigative needs and an inventory of real operations; settle event
    semantics, evidence, access, integrity, retention and the reading experience
    together. Existing activity/attribution and operator recording continue;
    further audit redesign is deferred ([ADR-0020](docs/engineering-decisions/0020-logging-after-core-operations.md)).
18. **Wide event logging** — separate dedicated milestone once most operations
    are implemented. Define useful request/job/workflow context, final outcomes,
    correlation, privacy, sampling and query acceptance from those operations.
    The existing sanitized telemetry foundation remains; no broad domain
    instrumentation rollout is part of the current feature work
    ([observability](docs/design-docs/observability.md)).
19. **Before public release** — live email provider and webhooks, browser and
    worker telemetry, deployment (`docs/design-docs/infra-deployment.md`).
20. **Curator accounts** (§6.13), then pricing. First complete
    [curation and paid-service delivery](docs/exec-plans/active/evaluate-curation-and-paid-services.md);
    document extraction and AI use the reviewed-import foundation, not a parallel
    unreviewed importer.

## 12. References

- Architecture: `ARCHITECTURE.md`; visual system: `DESIGN.md`.
- Focused designs: `docs/design-docs/README.md`.
- Settled foundations: `docs/engineering-decisions/README.md`.
- Security and reliability rules: `docs/SECURITY.md`, `docs/RELIABILITY.md`.
