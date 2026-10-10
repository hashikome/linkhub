# ADR-0023: Account lifecycle and unified collection actions

- Status: Accepted
- Date: 2026-10-09
- Amends: ADR-0014's separate collection contexts and the original service-operations no-deletion boundary.

## Context

The user requested compact account and collection tables with actions determined
by the viewer's role, admin account deletion, and one Collections view instead of
My hub / Service. The PRD already specifies a 14-day account deletion grace period.

## Decision

The backend advertises available account actions. Operators deactivate, suspend
or reactivate ordinary accounts; admins may also schedule/cancel deletion of
non-admin accounts. Admin accounts and self-restriction/deletion remain protected.
Inactive means deliberately deactivated, not signed out. Disabling access revokes
sessions, grants and pending authorization proofs. Cancellation leaves the account
inactive; reactivation never restores revoked sessions or grants.

Admin deletion disables access immediately and schedules permanent removal after
14 days. Bounded maintenance rechecks the deadline under the same authority lock
as cancellation, removes owned data through existing cascades, anonymizes retained
contributions through SetNull relations, and records completion atomically.
Self-service deletion is still a separate future workflow.

One paginated Collections projection combines owned and shared collections with
publicly readable collections and active holds for service operators. Search by
ID or collection URL is constrained by the same authority. Held private rows
contain moderation metadata only, never private titles or content. Owner actions
use existing collection policy; holding distribution remains a service capability.
A service grant never implies permission to edit, delete, publish or share access.

Collection rows use a secondary Action button that opens a native modal dialog. The dialog presents direct action links: View and Edit navigate immediately;
mutations continue to their appropriate operation form. JavaScript-free clients
use the same Action trigger with an expandable list. Owner publish, unpublish, sharing, transfer and
delete controls use existing APIs with explicit consequences before mutation.
Collection readers get Share in the toolbar; copying a URL does not grant access.

Account rows open detail directly through an enhanced row click or native name
link. Copy-ID controls do not navigate. Detail exposes permitted action buttons
at the bottom; there is no list selection or account action dialog.

## Consequences

The tables become smaller without moving authorization into the client. Permanent
account cleanup is irreversible after the grace period and is covered by tests.
Collections retain their independent access model; no global private-content list
or operator ownership bypass is introduced. Bulk operations remain outside scope.

### Final account navigation refinement (2026-10-09)

The user replaced single-row selection with direct account navigation: no Select
or Action column/toolbar on the Accounts list. Clicking a row opens account detail;
its name remains a native link for keyboard/no-JavaScript access. ID copying does
not navigate. Account detail presents permitted action buttons at the bottom,
without a chooser dialog. Consequence/reason forms remain authoritative for mutations.
This supersedes the earlier selection and account-dialog presentation decisions.

The subsequent presentation correction removes account-name anchors from the
list. Row clicks open detail, while the name is rendered as a plain-text native
form button for keyboard and JavaScript-free access. This replaces the native
name-link presentation above without changing navigation or authority.

## Cleanup amendment (2026-10-09)

Collection row/name clicks open the action dialog with no Action column. Choices
carry their final destination: View, Edit, History, Add a link, Share and moderation
detail no longer redirect through the collection action route. Only publish,
unpublish, transfer and delete use that route's consequence forms. The former
held-only list and link resolver are retired in favor of `/manage/collections`.
This supersedes the earlier Action-column and dispatcher descriptions; native
no-JavaScript navigation and backend authority remain unchanged.


## Amendment (2026-10-10)

[ADR-0033](0033-permanent-hub-handles-and-self-service-accounts.md) introduced
self-service account lifecycle and retained handle reservations. Its permanent
handle rule was superseded by [ADR-0042](0042-editable-hub-handles.md), then
[ADR-0043](0043-deliberate-hub-handle-changes.md) settled the current policy:
30 days between handle changes, with retired spellings never reusable by anyone.
Person username rules are separate. [ADR-0041](0041-fixed-account-email.md) fixes
account email pending a dedicated identity-change workflow; immutable UUIDs
continue to own references and authorization. Self-service lifecycle remains
accepted, with contextual recovery under [ADR-0040](0040-contextual-account-recovery.md).
