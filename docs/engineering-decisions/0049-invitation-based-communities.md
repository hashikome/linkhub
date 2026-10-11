# ADR-0049: Invitation-based communities

**Status:** accepted direction; implementation deferred

**Date:** 2026-10-11

**Refinement:** [ADR-0050](0050-community-entities-and-intake-integration.md)
supersedes the initial hub-wide membership interpretation with distinct communities
within a hub. The invitation and access safeguards below remain in force.

## Context

The owner distinguished joining a community from freely subscribing to updates.
Community membership should let an approved person read the owner's collections
published for that community without individual collection invitations.

## Decision

Use **Join community** for this future relationship. Owners invite people by email;
a person may request to join, with owner approval leading to an invitation.
Accepted members have viewer access to all collections that owner publishes for
community members. Membership grants no editing or management authority.
Collection contributor access remains a separate explicit grant.

Community publication is distinct from public publication. Public collections
remain readable by everyone. Ordinary unpublished collections receive no automatic
community access. This is a new hub-scoped read-access boundary, not a new role.
Existing implemented owner/viewer/contributor permissions are not changed by this
record or by the current import milestone. Import continues to offer each collection's
Published choice, enabled by default.

This supersedes self-service subscription as the intended relationship for access
to community-published collections. Existing subscription/follow behavior remains
implemented until a dedicated migration milestone; do not silently convert followers
into authorized community members or revoke existing collection shares.

## Follow-up acceptance

Specify invitation acceptance, account/email binding, owner approval/revocation,
request abuse controls, ownership transfer and how existing subscriptions migrate.
Central policy must enforce membership on every read and revoke access immediately
when membership ends. The community audience must be selected explicitly; neither
public publication nor a subscription alone proves membership. Pricing/entitlements
are separate decisions and are not implied here.
