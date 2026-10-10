# Attribution and activity

Status: API and web contributors/History are implemented. Item `addedBy` is
available in the API; its details presentation awaits preview cards. Manage's
hub audit view is implemented but provisional; notes and blocking are planned. Decision:
[ADR-0015](../engineering-decisions/0015-attribution-from-activity-records.md).

Audit strategy and redesign are deferred to a dedicated milestone after
fundamental operations ([ADR-0020](../engineering-decisions/0020-logging-after-core-operations.md)).
The existing History and attribution contract continues. Its use of audit rows
does not settle the future relationship between activity and audit evidence.

The subsequently authorized [bounded effect slice](../engineering-decisions/0021-bounded-audit-effects.md)
captures actual changes for core management operations below.

## Activity entries

content-category records in `audit_logs` is the append-only source for attribution and hub audit. Each
entry records the hub, actor, action, target IDs and database time in the same
transaction as the change. It contains no names, emails, tokens or authored text.

New publication, share-link, direct-access and transfer entries also retain nullable
`beforeState`, `afterState` and `outcome` columns, exposed as `effect` (or null) in
the hub audit API. State values are validated per action: publication/link enabled
state, share source+role (or none), and transfer hub UUIDs. Outcome distinguishes
success from no change. The mutation's locked state supplies the evidence;
audit failure rolls back the operation. Generic field diffs are not captured.
Historical entries and uncovered actions keep null effects.

Implemented actions cover collection creation/details/publication/deletion,
link-sharing and direct shares, transfers, item additions/updates/removal/reorder/
import, discussion moderation and answer selection, hub name/handle changes,
and audit reads. `auditActions` in `packages/types/src/audit.ts` defines the
contract; its `contentActions` subset defines who counts as a contributor.
Notes, blocking and reviewed-import commits add events when those workflows ship.

## Attribution and history

- Collections return their immutable creator and contributors: up to five
  people, most recent first, plus the total. Attribution grants no access.
- Resources return `addedBy`; `addedByUserId` is a read-efficient projection
  of the creating action. Unknown authorship stays null rather than fabricated.
- The collection header keeps owner and relative update time, with creator
  credit when ownership has changed. The exact timestamp is available on hover.
  A Contributors section above Discussion shows the authoritative total and up
  to five people, most recent first, with a remainder count. For up to three
  contributors, show avatar + username rows; larger groups show avatars with
  usernames on hover and in accessible link labels. Never show display names.
  Avatars link to person profiles; attribution never grants History access.
- `/c/<id>/history` is available to owners and contributors. Its API,
  `GET /api/v1/collections/:id/activity`, is cursor-paginated, returns 404 for
  unreadable collections and 403 for readers. Contributors see content and moderation
  only; the owner can also see sharing, link and transfer events.
- History returns the item's current readable representation or null after
  removal; it is not a snapshot of deleted text. Optional `resource_id` has no
  cascading foreign key, so deleting an item cannot erase its history.

`PersonRef` uses `{ userId, username }`; people appear as linked usernames
pointing to `/username`, without names or email. A person needs no hub to receive
attribution. See [people and hubs](people-and-hubs.md).

## Unified audit timeline

`GET /api/v1/manage/audit` returns the authorized timeline and records its own
reads. Content history is restricted to the signed-in owner's hub; own authentication
events and permitted service evidence share the same model and endpoint. Transfers leave historical entries in their original hub and write a
receiving event to the destination. Hub audit has no automatic expiry; deletion
and retention requirements are tracked in [SECURITY.md](../SECURITY.md).

[Manage › Audit Log](manage-workspace.md) presents this history across the hub
with Load more, one Search field for displayed row content, Action and From/To
dates. Search matches current actor labels/IDs, actions, target IDs, outcomes
and recorded changes within the owner's feed before pagination.

Manage defaults to `view=actions`; `view=all` includes routine reads. The API
defaults to all; selecting a specific read action normalizes
the view to all. View filtering precedes pagination and is part of cursor scope.
Read events are still recorded. Rows show the actual collection/item/invitation
target, affected share recipient, known effects and results. Missing historical
details are explicitly labelled. Timestamps show local `YYYY-MM-DD HH:mm:ss`;
the no-JavaScript fallback is labelled UTC. Current usernames accompany stable IDs.
The date range follows those same local days, with UTC as the native fallback.
