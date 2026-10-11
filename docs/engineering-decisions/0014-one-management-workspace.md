# ADR-0014: One management workspace, scoped by role

**Status:** accepted, amended 2026-10-08: one **Manage** workspace at `/manage`
**Date:** 2026-10-08

The dated amendments below preserve the evolution of this decision. Current
Collections and Audit views are unified and capability-scoped under ADR-0023 and
ADR-0024; neither has a My hub / Service switch. The owner-facing section is
labelled Access. See the [current workspace contract](../design-docs/manage-workspace.md).

## Context

A person can own a hub and also administer or operate the service. Separate
workspaces make navigation depend on switching roles rather than the task.
Shared navigation must not collapse the authority boundary: service operators
cannot read private collections or manage someone else's hub.

## Decision

Use one **Manage** entry and route family at `/manage`. Sections and actions
follow the authenticated person's capabilities. Accounts concerns service-wide
accounts; People concerns current access to the owner's collections. Team lists
admins/operators; Invitations sends and tracks invitations in the applicable
context. Collections and Audit identify My hub versus Service for people who
have both authorities. Owner and service API contracts remain separate.

## Amendment — 2026-10-08

The product owner explicitly replaced the separate owner/service workspace
choice with a unified Manage workspace. This supersedes both the earlier
separation and the interim decision to retain `/ops` as the service console.
There is no `/platform` migration or old-route compatibility requirement; the
product has not been deployed. Shared navigation with explicit context preserves
the authorization boundary while avoiding duplicate management areas.

## Rationale

- One place for management, with consistent tables, actions and audit patterns.
- A person sees the union of capabilities they hold, without duplicate accounts.
- Hub owners manage their own content; service authority stays operational.

## Constraints to preserve

- The API authorizes every read and action; navigation is never a permission.
- Service sections never expose private titles or content (ADR-0009).
- Owner scope is derived from the authenticated user, never a requested hub ID.
- Only implemented capabilities appear. Owner invitation delivery, subscriptions,
  blocking and cross-collection moderation remain planned until their full
  authorized journeys are implemented.

## Links

- [Manage](../design-docs/manage-workspace.md)
- [ADR-0009](0009-operator-authority.md)
- [ADR-0013](0013-permission-roles-and-display-labels.md)

## Label clarification (2026-10-09)

The owner-facing People section is now labelled **Access**, including its page
heading. It manages granted access rather than person accounts; Accounts remains
the service-wide identity section. The existing `/manage/people` route and API
permissions are unchanged.

## Amendment — 2026-10-09

[ADR-0023](0023-account-lifecycle-and-unified-collection-actions.md) replaces the Collections My hub / Service split with one capability-scoped table. Audit keeps explicit contexts. The authority boundary remains unchanged.

## Audit consolidation — 2026-10-09

[ADR-0024](0024-one-audit-log.md) supersedes separate audit storage and the Audit context switch. All event categories use one AuditLog; permissions and attribution rules remain unchanged.

## Navigation layout — 2026-10-11

Manage sections use a shared desktop sidebar and a native collapsible menu on
narrow screens. Subsections (Import → New import / Review) live under their
section in that navigation; the working area holds one view, headed by its title.
Status filters remain with the table. Capability rules and routes are unchanged.

Navigation sections with children use native expand/collapse controls; expanding
Import never navigates. New import and Review are the navigation links. Sections
without children remain direct links. The current section starts expanded.
