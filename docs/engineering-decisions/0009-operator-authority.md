# ADR-0009: Separate operator authority; step-up for sensitive actions

**Status:** accepted  
**Date:** 2026-10-07

## Context

Running the service needs account and content moderation without turning
operators into readers of private content.

## Options considered

- Admin role inside the product policy
- Separate service-operator authority with its own audit

## Decision

Running the service is a separate, explicitly granted, site-wide authority
(operators and admins), outside the collection access model. It manages
accounts and public-content holds, never reads private content, and is fully
audited; sensitive actions require recent verification. Scope and screens:
[service-operations.md](../design-docs/service-operations.md).

## Rationale

- Moderation without a privacy back door.

## Constraints to preserve

- Operator listings show no private titles.
- Every operator action carries a reason and is audited with its effect.

## Links

- [service-operations.md](../design-docs/service-operations.md)
- [SECURITY.md](../SECURITY.md)

## Audit consolidation — 2026-10-09

[ADR-0024](0024-one-audit-log.md) supersedes separate audit storage and the Audit context switch. All event categories use one AuditLog; permissions and attribution rules remain unchanged.
