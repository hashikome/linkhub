# Manage

Status: shared workspace implemented at `/manage`.
Decision: [ADR-0014](../engineering-decisions/0014-one-management-workspace.md).

One workspace serves hub owners, operators and admins. Navigation shows the
union of their implemented capabilities. A hub has one owner; collection
contributors and viewers work from their collection, not an owner's Manage.
The API owns every permission, including direct requests to hidden sections.

## Implemented sections

| Section | Audience and context |
| --- | --- |
| Accounts | Operators/admins: Account (name and username), Email, Role, Status, Member since, Last login and Sessions; search by full user ID, username, email or hub handle |
| Access | Hub owners: distinct people currently granted collection access, with collection counts; access is managed from the collection |
| Collections | Owners: their collections, visibility and edit links. Operators/admins: public collection review and holds |
| Team | Admins: current admins/operators and permitted removal actions |
| Invitations | Admins: service invitations, delivery, resend and revoke |
| Analytics | Operators/admins: all-time share requests and reported opens, grouped by resource kind and destination; Refresh reloads counts |
| Audit Log | Owners: their hub changes and own authentication events. Operators/admins: also service and authentication evidence. One Search field matches actor, action, target, outcome and change; Action and From/To narrow the results. Immutable IDs accompany current actor usernames |

Audit Log is one permission-scoped timeline with no context tabs, backed by one AuditLog model. Collections uses one viewer-scoped list with an ID/link search and backend-provided actions.
Audit Log defaults to actions/decisions and offers an Include read events checkbox. It
shows captured changes/results instead of a mostly empty Access column; the
[bounded effects contract](../engineering-decisions/0021-bounded-audit-effects.md)
defines its limited coverage and treatment of older records.
Hub-only accounts see their own context automatically. Access is paginated and
contains no service-wide email search or account suspension controls. Service
roles never grant access to someone else's private content. A hubless operator
still has service controls; an ordinary hubless reader does not need Manage.

## Planned owner capabilities

| Section | What |
| --- | --- |
| Collection extensions | Bulk import/export and richer filtering; single-collection actions are implemented |
| Comments | Comments across the hub's collections, newest first, filterable by collection and state; hide, show, mark answers |
| Access | Like Google Drive's "Manage access", across the hub: **Requests** first ("reader asked to view *Backend building blocks*" — Can view, Can contribute, Decline, Decline and block), then every collaborator by collection (viewer, contributor; change role, remove) and the link-shared collections. Each collection's **Manage access** opens this view filtered to it |
| Invitations | Send and track collection-access invitations; show the invited collection, viewer/contributor access, recipient and status; resend or revoke pending invitations |
| Access extensions | Accepted collaborators, grouped by person with the collections and viewer/contributor access granted to each; change or remove access. Also **Subscribers** (remove, block) and **Blocked** (unblock) |
| Import & export | Import: bulk import drafts ([bulk-import.md](bulk-import.md)). Export: several collections at once (one document each, zipped), optionally including referenced collections |
| Audit extensions | Richer item labels for the implemented hub audit ([attribution-and-activity.md](attribution-and-activity.md)); identity filters and current person usernames are implemented |

Every section uses the pattern of the implemented operations tables: minimal tables,
one filter row, row actions, and "Confirm it's you" for sensitive actions.

## Invitations and people

Use the same invitation/list pattern as service operations: Invitations owns
sending and pending/expired/revoked history; Access shows accepted collaborators
and their current access. Reuse suitable presentation and delivery primitives,
while keeping the authorization contracts distinct. Service invitations grant
admin/operator access; owner invitations grant access to a specific collection
and its resources. Acceptance does not create hub membership or grant access to
other collections. The collection policy remains authoritative.

## Planned: blocking someone from a hub

The owner blocks someone where that person appears — a comment's menu
(**Block username**), a subscriber row, an access request (**Decline and block**),
a collaborator row — like Instagram or TikTok; Manage › Access lists blocked
accounts to unblock. The block applies to the whole hub. Blocking keeps the
account from taking part: it cannot comment on, subscribe, collaborate on, or open
link-shared collections of that hub, and existing collaborations and subscriptions
end. Published collections stay readable to everyone, the blocked account
included — publishing is for the public, not only the people you like.
Blocking is private (the blocked person is not told) and reversible.

## Routes

`/manage` opens Accounts for operators/admins and Collections for owners.
Sections use `/manage/{people,collections,team,invitations,analytics,audit}`. Analytics sits immediately before Audit Log and reads `/api/v1/share/analytics?scope=service`; empty activity shows zero totals and guidance for trying a share. Audit Log uses
`/api/v1/manage/audit` with one set of filters and one chronological cursor. Owner reads derive scope server-side through the current session.
Service APIs stay under `/api/v1/operations/*`; owner Access uses
`/api/v1/me/people`, and collection reads use the existing hub policy.
Future owner invitations will share the Invitations section with explicit
context, without conflating service grants and collection access.


## Collection actions

The [shared Share screen](sharing.md) at `/share` serves profiles, hubs, collections and the site. It offers Copy link, visible but disabled until JavaScript
is ready. Without JavaScript the URL remains selectable for manual copying.
Social destinations remain deferred. A contextual link below returns to the
originating page: “Back to collections” for the management list, “Back to
collection” for the reader, and “Back to hub” for a hub. Entry links carry a
validated local return path, preserving filters and working without JavaScript;
collection operations retain it through their redirects. Direct visits fall back
to the collection. There is no separate Cancel control.

Collections lists Collection, Hub, Visibility, Status and Updated without
context tabs or an Action column. Clicking a row opens its action dialog; the
plain-text collection name is a keyboard-accessible button, disabled until the
dialog is ready. Clicking the ID only copies it. The first enabled click opens
the popup without expanding the table row. The dialog
uses the site's canvas, typography, blue links and separated header/footer, with
Escape/Close returning focus to the collection name. Native disclosure links are available only
without JavaScript. Choosing a permitted action closes the popup immediately and
navigates directly to its destination, including when the destination loads slowly.
Owner actions include edit, add a link, publish/unpublish,
share/manage access, transfer and delete. Contributors can open/history/share the
URL; service operators can hold/release eligible distribution. Private held rows
show only IDs/hub/hold metadata. See [ADR-0023](../engineering-decisions/0023-account-lifecycle-and-unified-collection-actions.md).

Collection pagination preserves PostgreSQL creation-time precision by anchoring
the next page to a currently authorized row. If that row is deleted or becomes
inaccessible, the API returns `invalid_cursor` and the list offers Reload list.
It never silently skips the rest of a timestamp boundary.

## Account navigation

Clicking an account row opens its detail page. The plain-text name is a native form button for
keyboard and JavaScript-free navigation, with no anchor or link styling; ID copying does not navigate. No Select
or Action column is needed. Detail shows the permitted action buttons at the
bottom, followed by the selected operation's consequence/reason form, without a
chooser dialog. Member since and Last login use viewer-local timestamps to seconds; Sessions is a count.

Account detail places the username beneath the name as a public-profile link; its
metadata rows begin User ID, Email, Hub, followed by the existing profile facts.

Account detail uses compact metadata spacing and links the hub name to `/h/{hubId}` without displaying its handle or ID. Longer profiles and session lists retain normal page scrolling.


Audit Log places Apply filters on a left-aligned row below Include read events
and the search/action/date fields. It uses the standard secondary button,
matching Search. Clear filters appears beside it only when filters are applied
and returns to the default log. Additional optional filters can join Include
read events above the buttons; a personal-only option is deferred.
