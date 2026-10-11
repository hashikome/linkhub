# ADR-0050: Distinct communities and reusable intake

**Status:** accepted direction; implementation deferred

**Date:** 2026-10-11

## Context

Joining a learning community currently crosses social messages, a form, a group
invitation, and a separately shared resource document. New members struggle to
find earlier answers or follow their application. The owner identified the shared
workspace's inquiry product as a reusable intake service and selected NSLinkHub as
its first planned integration, with the portfolio as another client.

## Decision

A hub may contain multiple distinct, goal-specific **communities**. Community
identity, invitations, accepted membership, and collection audience associations
are separate domain concepts. Membership grants viewer access to collections
explicitly shared with that community, including their visible discussion history.
Signed-in members can participate under the existing discussion policy; membership
does not grant resource editing or contributor moderation powers.

This supersedes ADR-0049's initial **hub-wide membership** interpretation: the hub
owns communities, but joining one does not grant access to another. Its invitation,
verified acceptance, explicit contributor grants, and no implicit follower migration
decisions remain in force. Goal-specific groups justify the additional entity;
collection shares alone would require repeating admission and revocation for every
resource library. Exact schema and API contracts remain to be designed.

An owner may share the same collection with more than one community in their hub
without copying its content. Public publication remains public; selecting a community
audience must not set the existing global `published` flag. Ordinary private content
receives no automatic community access. Removing membership removes that access path;
independent public access or direct grants continue under the central policy.

Communities are planned for paid Curator owners; invited members need no paid plan.
Prices, limits, entitlement lapse behavior, and any community payment collection
are separate decisions. No new authorization role is introduced by a paid plan.

The reusable intake product owns forms, inquiries/applications, assignment, review,
private team notes, and client-visible follow-up. Its scope includes both a team
portal and a client view. NSLinkHub owns communities, invitations, membership,
entitlements, and collection authorization. The portfolio's independent API/email
delivery requirements remain part of that separate product's brief.

The intended community journey is application → review → invitation → verified
acceptance → community library and discussions. Submission and approval alone grant
no membership. Direct invitations remain available without an application. Bind
integration context to immutable identifiers and trusted configuration; retries
must not duplicate invitations or memberships. Client access and forms-team access
are distinct from community membership and never follow automatically from it.

## Consequences and follow-up

Design the community audience policy, invitation/account binding, revocation,
ownership transfer, subscriptions migration, and owner entitlements before changing
runtime authorization. Define trusted review outcomes, reconciliation after failures,
changed decisions, and deleted communities with the intake integration contract.
Client-visible updates must exclude internal notes and other applicants' records.

The [NSLinkHub backlog](../backlog/curation-and-paid-services.md#community-access-and-intake-integration-task)
owns local implementation work. The local shared intake and applications brief
(`../workspace/backlog/inquiry-workspace.md`, relative to the repository root)
owns the separate product. `../workspace/backlog/README.md` links both. Those sibling documents are planning references; this record is the
self-contained authority for NSLinkHub's boundary. Neither product integration nor
community access is implemented by this documentation milestone.
