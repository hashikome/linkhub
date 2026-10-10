# ADR-0001: Google-Drive tenancy: one hub per user, per-collection sharing

**Status:** accepted; amended by
[ADR-0018](0018-people-and-hubs-are-separate.md) (a hub is optional, created on
first use, still one per person and never transferred)  
**Date:** 2026-10-07

## Context

Early designs had shared workspaces with memberships and roles. That made every
query depend on membership state and made sharing a single collection awkward.

## Options considered

- Organization/workspace memberships with roles
- One personal hub per user with per-collection grants (Google Drive model)

## Decision

Under ADR-0018’s amendment, a person owns at most one hub, created on first
save or collection creation and never transferred. Collections are the unit of
sharing. One policy service resolves access in order: hub owner (full) → direct
share → active share link → published. There are no hub memberships or content
admin bypasses.

Optional hubs and `viewer`/`contributor` identifiers are implemented under
ADR-0018. They replace the original signup-created hubs and `reader`/`editor`
grants. See [tenancy and access](../design-docs/tenancy-and-access.md).

## Rationale

- Sharing matches how people already think (a file, not a team).
- One policy chain keeps authorization auditable and testable in one place.
- No membership state to keep consistent across features.

## Constraints to preserve

- Every hub-owned query carries `hubId`; route IDs never prove access.
- Collection access goes only through `CollectionPolicyService`.
- Grants apply to one collection; references and links never inherit them.
- Operator authority is separate and never grants private reads (see the operator-authority record).

## Links

- [tenancy-and-access.md](../design-docs/tenancy-and-access.md)
- [SECURITY.md](../SECURITY.md)
