# Web product experience

Status: public reading, email-code sign-in, account settings, Save a link,
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

The lowercase `nslinkhub` wordmark links to the signed-in person's `/h/<hubId>`
or the `/hub` entry with explicit Create hub when they have no hub, and `/` when signed out. Discover stays in the header beside account controls.
Signed-in visitors also have Save a link, the appearance control and an
avatar-only account menu: Profile, Hub, Notifications, Settings, Manage when
authorized, and Sign out. Signed-out navigation keeps **Sign in**.

The landing pairs **Save your first link** with **Sign in**. Its discovery copy
is “Someone already found your next good read.” followed by “Discover the links
someone kept.” A labelled, noninteractive example shows a real collection's
structure: hub context, title, description, tags, headings, external links and
a collection reference. No control promises an unbuilt action.

| Surface | Route and data | Main action |
| --- | --- | --- |
| Landing | `/` | Save your first link; Sign in; Discover |
| Discover | `/discover`; `GET /api/v1/discover` | Open a collection |
| Hub | `/@handle` or `/h/<hubId>`; hub lookup and authorized collection list | Open a collection |
| Collection | `/c/<id>`; collection, resources and discussion APIs | Open a resource or referenced collection |
| Pretty collection URL | `/@handle/<slug>`; handle then hub/slug resolution | Read the same collection |
| Item details | `?item=<id>` on either collection address; authorized single-resource API | Expand metadata and attribution inline; open the destination |
| Capture | `/capture`, `/capture/<draftId>` | Save one or two links |
| Section authoring | `/c/<id>/sections`, optional `?section=<id>` | Owner/contributor adds a nonempty section or edits its description |
| Collection details | `/c/<id>/edit` | Owner edits title, description and comment settings |
| History | `/c/<id>/history` | Owner/contributor reads authorized activity |
| Account | `/settings`, `/notifications` | Edit profile/hub; read invitation notices |
| Manage | `/manage` and its sections | Authorized account/moderation work |

Sharing UI is deferred to the sharing and hub-engagement slices. Its eventual
controls must emit immutable `/c/<id>` or `/h/<hubId>` addresses; only an explicit
access-link action may include the supplied collection token. Never attach
it to an external URL, pretty browse link or referenced collection. A failed
optional hub lookup must not hide an otherwise authorized collection read.

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

Settings has Profile, Hub and Notifications sections, showing one at a time.
Profile edits username and full name; email and member-since are read-only. Hub
edits name, **Show owner** and description, lets the owner explicitly claim one
permanent handle, and shows its immutable ID. Claimed handles appear as plain
label/value facts matching Hub ID, not text inputs. Usernames remain freely editable.
View your public hub sits beneath Handle. Autosave retains newer drafts and provides
Saving/Saved or retry feedback; a noscript Save changes button preserves native
editing. Handle availability is advisory; backend validation decides the write.
Missing hubs show a first-save action instead of empty required fields.
Hub.showOwner controls the public ownership connection in both directions;
profile names remain visible, and authorization is unchanged.

The header avatar resolves through server-proxied Gravatar for an eligible
account's verified email, then our generated SVG. Settings has no picture preview
or upload field; a help question below the profile fields links to
`/support#profile-picture`. Support explains optional Gravatar setup and updates;
a missing image is never presented as proof that no provider account exists.
See [the avatar contract](identity-and-handles.md#gravatar-follow-up).
Appearance lives only in the header: System → Light → Dark → System. Signed-out
visitors follow the system preference; saved appearance applies only with a
valid session. The footer has copyright, “an ns series product”, Discover and
Support. Readiness is API monitoring, with no client status page.

Notifications currently lists service invitations as expandable messages,
unread first. Opening it resets the badge; Clear all hides existing entries.
Invitation acceptance begins from the emailed link. Status pages and notices
point to that email; they never authorize acceptance themselves.

## Manage

The shared workspace at `/manage` shows Accounts, Access, Collections, Team,
Invitations and Audit according to the viewer’s capabilities. It uses tables, filters and explicit row actions with required
reasons. It never grants private-content access or exposes private previews.
New invitation recipients consent before account creation; every recipient
verifies a fresh invitation-bound code before a role activates.

Sensitive actions require recent verification. **Confirm it's you** sends
nothing until requested, then resumes the waiting action once for its original
account and operation ID. The [verification contract](email-verification.md)
and [operator contract](service-operations.md) own the details. Owner and service controls share [Manage](manage-workspace.md), with explicit
context where both apply. API permissions remain separate.

## Failures and acceptance

Missing, private and removed collections all say “This collection isn't
available. It may be private or no longer exist.” Offer Discover and, when
signed out, sign-in with the permalink or pretty destination and supplied share
token preserved. Reveal no title, owner or existence information. Request access
awaits the owner approval workflow.

Show service failures where they interrupt the task, with retry or return.
Never expose dependency names, connection details or raw exceptions. Session
changes clear private rendered state; request failures retain safe drafts and
never trigger mutation retry loops. Backend authorization applies to every
request; hidden controls are not a security boundary.

Prove journeys with keyboard, narrow screens and no JavaScript. Permalinks
survive handle/slug changes and collection transfers. Revocation and unpublishing
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
| Organizing items | Sections, references, reorder and keyboard alternatives; preview cards and notes |
| Sharing and publishing | Per-collection viewer/contributor grants, access requests and invitations; explain publication without implying reference access |
| Manage | Hub-wide collections, comments, access, subscribers/blocking, import/export and activity |
| Bulk import | Reviewed drafts with per-row validation, folder destinations and deliberate partial commits |
| Downloads | Markdown/PDF/Word, optional reference expansion, zip for several collections |
| Notifications | Broader inbox kinds and per-kind/per-hub preferences |
| Email change | Confirm current address then verify new address; completion revokes sessions; API exists, web screens pending |
| Account deletion | Verified proof, export/transfer opportunity and explicit retention workflow; currently disabled |

Focused designs own these details; planned routes must not appear as working
navigation before their complete journeys exist.
