# ADR-0017: Hubs as entities with members (rejected)

**Status:** rejected  
**Date:** 2026-10-08

## Context

Account handover by email change was found to hand over the person, not just
the hub: the access others gave them, their comments, credit, saves and
follows. Making hubs organizations with members (owner, manager, member),
collaborations between hubs and paid "Pro hubs" was explored as the fix.

## Decision

Rejected. The ns series is for individuals; organizations are a different
product's scope. A hub stays one person's space with one owner (ADR-0001). The
real problem is fixed without memberships: an email change is only an email
change, a hub is never transferable (it is its owner's fingerprint; only
collections transfer), and collaboration happens per collection with
**contributors** and **viewers** invited by name.

If organizations are ever needed, follow GitHub: people keep their personal
accounts, can own organizations, and transfer collections into them.

The address-update assumption above is superseded by [ADR-0041](0041-fixed-account-email.md):
email changes are unavailable pending a controlled identity action. The rejection
of memberships and hub transfers remains unchanged.

## Links

- [ADR-0001](0001-drive-tenancy-model.md)
