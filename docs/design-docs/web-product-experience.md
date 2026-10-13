# Web product experience

Status: public reading, passwordless sign-in, account settings, Save a link,
collection details editing, discussion, attribution/History and service
operations are implemented. Planned journeys are listed below;
[PRODUCT.md](../../PRODUCT.md#11-delivery) owns delivery status and order.
The [interface system](web-interface-system.md) owns components and interaction;
[DESIGN.md](../../DESIGN.md) owns visual tokens.

## People and purpose

A reader arrives through a shared link or Discover, understands a collection,
and opens a useful resource. An owner maintains their library and shares durable
references. A collaborator works on a specific collection without joining a hub.
The experience should feel like a dependable personal library: legible titles,
clear destinations and visible structure, with most space given to reading.
Never invent counts, covers, recommendations or social proof to fill a page.

People appear by username and have a profile at `/username`. Their optional hub
has its own name and @handle; subscriptions are a later slice. See
[people and hubs](people-and-hubs.md).

## Navigation and entry

The lowercase `ntumie.` wordmark links to the signed-in person's `/h/<hubId>`
or the `/hub` entry with explicit Create hub when they have no hub, and `/` when signed out. Discover stays in the header beside account controls.
Signed-in visitors also have Save a link, the appearance control and an
avatar-only account menu: Profile, Hub, Notifications, Settings, Manage when
authorized, and Sign out. Signed-out navigation keeps **Sign in**.

The landing hero has one action: **Save your first link**. **Sign in** stays in
the header alongside **Discover**. The supporting message follows the hero:
“Turn your good finds into useful guides, share what you know, and discover what
others have brought together.” Discovery is suggested in this copy rather than repeated in
a separate section. A labelled example uses the current reader's metadata, tags,
sections and resource disclosures, with one item's details initially expanded.
Section headings collapse or expand their links; resource titles open working
external destinations. Fictional identities have no profile or hub links, and
ordinary disclosure toggles never change the landing URL or scroll on arrival.
Both demo and real collections offer “Copy link to this item” once its JavaScript
handler is ready, with visible confirmation and a manual-copy fallback. With
JavaScript disabled, a native link opens the item address for copying. Demo links reopen
the selected item on the landing page; collection links reopen it in its collection. The
compact preview omits the full reader's sharing and discussion controls.
Its “A web worth keeping” collection pairs Forte Labs' bookmark-organization
article with Maggie Appleton's digital-garden essay: a practical organizing
method and a perspective on cultivating and sharing knowledge.

| Surface | Route and data | Main action |
| --- | --- | --- |
| Landing | `/` | Save your first link; Discover in the header |
| About | `/about`; real Support and maker-portfolio links | Share ntumie.; Join ntumie. in the footer goes directly to `/sign-up` (no footer link when signed in) |
| Discover | `/discover`; `GET /api/v1/discover` | Open a collection |
| Hub | `/@handle` or `/h/<hubId>`; hub lookup and authorized collection list | Open a collection |
| Collection | `/c/<id>`; collection, resources and discussion APIs | Open a resource or referenced collection |
| Item details | `/c/<collectionId>?item=<id>`; authorized single-resource API | Expand metadata and attribution inline; open the destination |
| Capture | `/capture`, `/capture/<draftId>` | Save one or two links |
| Section authoring | `/c/<id>/sections`, optional `?section=<id>` | Owner/contributor adds a nonempty section or edits its description |
| Collection editing | `/c/<id>/edit` | Owner edits collection details; owners/contributors manage sections and reorder items |
| History | `/c/<id>/history` | Owner/contributor reads authorized activity |
| Account | `/settings`, `/notifications` | Edit profile/hub; read invitation notices |
| Manage | `/manage` and its sections | Authorized account/moderation work |

The contextual [Share page](sharing.md) serves collections, hubs, profiles and
the site. Controls emit immutable subject addresses; only an explicit
access-link action may include the supplied collection token. Never attach
it to an external URL or referenced collection. A failed
optional hub lookup must not hide an otherwise authorized collection read.

### Unified sign-in entry

Continue with email and Continue with Google share the saved sign-in destination.
First-link capture goes directly to email-code verification. After email entry, offer a registered passkey or an email
code without disclosing whether an account exists. Google may lead to inline
verification. If there is no account, show Create your account with the
email and two choices: Create account, or Already have an account? Sign in. The
latter cancels the pending Google association and returns to ordinary sign-in with
the destination intact, so the person can enter their email or choose Google again.
Creation uses Google's verified email and name; no extra inbox code. Never silently register someone who chose the wrong Google account.
Invitations keep their own email-code acceptance journey. See
[ADR-0039](../engineering-decisions/0039-confirmed-google-account-creation.md).

Google's verified email must equal the product account email on every sign-in,
including after linking. Mismatches roll back authentication and redirect to
Continue with email. Product copy speaks of creating an account or signing in;
linking is an internal implementation detail, not onboarding language.

## Discover and hubs

Discover shows the API's recency-ordered publications. Collection rows include
title, up to two description lines, hub context and update time. Do not imply
ranking quality or popularity; text/tag search is planned.

Hub pages show the hub's independent name, `@handle`, description and optional
“@handle by Owner Name” attribution. Never substitute email for a missing name.
Visitors see published collections; the authenticated owner sees their own
collections, including private ones. The API authorizes both lists. Settings
alone offers **View your public hub** with `?view=public`, always using public
queries. `/hub` is a signed-in shortcut, not a shared address.

Desktop lists fit complete rows in the available frame with Previous/Next.
Mobile has explicit More collections; native cursor links work without
JavaScript. Hide pagination when everything fits. Empty Discover says “No
published collections yet.” Empty public hubs say “No published collections
here yet.” Empty owner hubs offer first-link capture.

## Collections and discussion

The reader is one sheet: hub context and actions, title, text description,
tags, owner/contributor/update metadata, then ordered headings and resources.
The header shows **Share** and, when the API grants canEdit, **Edit** at every
screen width. Viewers have Share and Add a comment as their main actions; items
and sections toggle directly. There is no global expansion toolbar. Edit opens
one authoring page: owner details, an Items and sections area with the owner's
Add a link flow, section editing and reordering, and a secondary History link.
Contributors enter the content area without owner settings. A session alone
never proves permission; all writes remain authorized by the backend.

External links show their server-resolved page title, falling back to a readable
address, then hostname, external-link glyph and tags. References use the readable
destination's title and immutable permalink; unreadable targets are neutral
unavailable entries. Headings group resources without creating access boundaries.
There are no title overrides, parent breadcrumbs, remote thumbnails or favicon
fetches. Preserve backend ordering and ordinary anchor/modified-click behavior.
Descriptions render as text with line breaks; do not inject API strings as HTML.
Resource titles turn blue on direct hover or keyboard focus, without underlines
or repeated chevrons. Other item space still expands/collapses details inline.
Desktop resource panels load the next batch as the reader scrolls near the end;
mobile and short viewports retain a centered **More resources** control, keeping
discussion reachable. The manual control also remains a desktop fallback for
keyboard use and short/collapsed lists. Loading preserves position and focus;
failures require explicit retry, with existing results retained.

Owners edit title, description and comment settings together through a native form. Validation
failures retain the draft. Version conflicts show current values and require a
deliberate retry. Section authoring and reordering are available from Edit;
notes and preview cards remain planned; see [collections and resources](collections-and-resources.md).

Discussion appears beside the reader on wide screens and after resources on
narrow screens. Posting, replies, editing/deleting one's own words, contributor
moderation and accepted answers follow the [discussion contract](discussion.md).
Signed-out readers can sign in and return to the open composer. Drafts survive
closing disclosures. Contributor badges describe capability, never access grants.

## Save a link

Capture accepts one or two public addresses with optional tags; titles come from
the pages. Before and after sign-in, each usable address receives a title/status
check. The form shows its title and validation feedback; richer previews belong
on saved collection items. Failed title checks leave valid addresses saveable. `/capture/<draftId>` resumes a 30-minute encrypted HttpOnly draft.
Up to three drafts coexist. URLs never enter navigation strings or client
storage. Existing collections require a destination choice; a new collection is
private. Backend transactions and retry receipts prevent duplicate saves.

When verification is needed, the form says “Verify your email to save this
link.” Ordinary verification submits the saved intent; invitation verification
never does. Save failure keeps both session and draft for a deliberate retry.
Signup creates the account; the first successful save creates the hub and
private collection in one transaction. A failed save leaves no empty hub.

## Account and appearance

Settings has Profile, Hub, Notifications and On this device sections, plus Security at
`/settings/security`. Profile edits username, full name and bio; email and
member-since are read-only. Hub
edits name, **Show owner**, description and handle, and shows its immutable ID.
Handle has availability feedback and Save handle when eligible; a 30-day
cooldown shows a read-only value and the next eligible date. Retired handles are
never reusable. Shared UUID links survive renaming (ADR-0043). Usernames remain freely editable.
View your public hub sits beneath Handle. Autosave retains newer drafts and provides
Saving/Saved or retry feedback; a noscript Save changes button preserves native
editing. Handle availability is advisory; backend validation decides the write.
Missing hubs show a first-save action instead of empty required fields.
Only the selected section loads initially. Opening another section loads its
controls while retaining previous drafts. Timezone choices load when the picker
is focused; the saved selection is visible immediately.
Hub.showOwner controls the public ownership connection in both directions;
profile names remain visible, and authorization is unchanged.

External resources open in new tabs by default, keeping the collection available
while the reader explores another site. On this device offers **Open external
resources in the same tab**, off by default.
The preference belongs to this browser, not the account: desktop and mobile can
choose independently. A one-year cookie retains the opt-in across sign-out;
clearing browser data or turning it off restores new-tab behavior. Native links
honor it before hydration and without JavaScript, including paginated resources.
All ntumie. destinations stay same-tab, regardless of collection ownership or
whether an absolute ntumie. URL was stored as an ordinary link. External links
retain no-referrer behavior and new tabs receive no opener; new-tab links carry
an accessible hint. Browser modifier keys and menus retain their usual behavior.

Account access and deletion is linked from Profile. Signed-in users choose
email-confirmed deactivation or deletion. Signed-out visitors encounter recovery
only after proving their email during sign-in or first-link capture: self-deactivated
accounts see Reactivate account; eligible deletion schedules see Cancel deletion.
The backend selects one action. Cancellation leaves the account inactive, and
recovery requires fresh sign-in. See [email verification](email-verification.md).

The header avatar resolves through server-proxied Gravatar for an eligible
account's verified email, then our generated SVG. Settings has no picture preview
or upload field; a help question below the profile fields links to
`/support#profile-picture`. Support explains optional Gravatar setup and updates;
a missing image is never presented as proof that no provider account exists.
See [the avatar contract](identity-and-handles.md#profile-pictures).
Appearance lives in Settings → On this device, with System, Light and Dark
choices saved in this browser and applied only with a valid session. Signed-out
visitors always follow the device preference. The header has no theme control.
Product footers show a right-aligned About ntumie. link. On About, signed-out
visitors see Join ntumie. to `/sign-up`; signed-in visitors see no footer link.
The web footer has no tagline, year or divider. About holds site sharing, Support
and the maker’s portfolio. See
[ADR-0063](../engineering-decisions/0063-wordmark-footer-and-appearance.md).
Readiness is API monitoring, with no client status page.

Notifications currently lists service invitations as expandable messages,
unread first. Opening it resets the badge; Clear all hides existing entries.
Invitation acceptance begins from the emailed link. Status pages and notices
point to that email; they never authorize acceptance themselves.

## Manage

The shared workspace at `/manage` shows Accounts, Access, Collections, Team,
Invitations, Analytics and Audit Log according to the viewer’s capabilities. It uses tables, filters and explicit row actions with required
reasons. It never grants private-content access or exposes private previews.
New invitation recipients consent before account creation; every recipient
verifies a fresh invitation-bound code before a role activates.

Sensitive actions require recent verification. **Confirm it's you** sends
nothing until requested, then resumes the waiting action once for its original
account and operation ID. The [verification contract](email-verification.md)
and [operator contract](service-operations.md) own the details. Owner and service controls share [Manage](manage-workspace.md). Collections and
Audit Log each use one permission-scoped projection; API permissions remain separate.

## Failures and acceptance

Missing, private and removed collections all say “This collection isn't
available. It may be private or no longer exist.” Offer Discover and, when
signed out, sign-in with the collection ID destination and supplied share
token preserved. Reveal no title, owner or existence information. Request access
awaits the owner approval workflow.

Show service failures where they interrupt the task, with retry or return.
Never expose dependency names, connection details or raw exceptions. Session
changes clear private rendered state; request failures retain safe drafts and
never trigger mutation retry loops. Backend authorization applies to every
request; hidden controls are not a security boundary.

Prove journeys with keyboard, narrow screens and JavaScript enabled. Native
fallbacks remain useful but JavaScript-free parity is not mandatory. Permalinks
survive handle/title changes and collection transfers. Revocation and unpublishing
remove access on revalidation; private responses never enter shared caches.
Browser verification and source checks are described in the
[verification runbook](../runbooks/verification.md); live provider and deployment
acceptance remain [release requirements](../runbooks/release.md).

## Planned journeys

| Journey | Contract |
| --- | --- |
| Subscriptions | People subscribe to hubs; personal home and updates |
| Home | Separate My collections, Shared with me, Saved and Subscriptions views |
| Dormant saves | Keep the saved-list title and date with “Currently unavailable”; suppress tags/previews, allow removal, restore opening on republish |
| Organizing items | Preview cards, notes and targeting a section from Save a link; section authoring and reordering are implemented |
| Sharing extensions | Access requests and email invitations; direct grants, access links, publishing and the contextual Share page are implemented |
| Manage extensions | Hub-wide comments, subscribers/blocking, reviewed import/export and richer access controls; collection management and audit are implemented |
| Bulk import | Reviewed drafts with per-row validation, folder destinations and deliberate partial commits |
| Downloads | Markdown/PDF/Word, optional reference expansion, zip for several collections |
| Notifications | Broader inbox kinds and per-kind/per-hub preferences |
| Account email | Fixed; profile updates cannot change it. Controlled email change is backlog for a dedicated POST action (ADR-0041) |
| Account export | Whole-account export automation before deletion; verified deactivation, deletion and contextual recovery are implemented |

Focused designs own these details; planned routes must not appear as working
navigation before their complete journeys exist.
