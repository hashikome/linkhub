# ADR-0008: References grant no access and reveal nothing unreadable

**Status:** accepted; creation scope and lifecycle amended by [ADR-0047](0047-owner-scoped-collection-references.md)
**Date:** 2026-10-07

## Context

Collections can reference other collections. A reference must not become a
side door into a private collection or leak its title.

## Options considered

- Inherit access through references
- References are pointers; the target's own policy decides

## Decision

A collection reference never inherits or grants access. A reader who can't
open the target sees a neutral unavailable item: no target id, no title and no
stored override. Share tokens never travel to targets.

## Rationale

- Guides can link freely without widening access.

## Constraints to preserve

- The visibility rule is applied at the output boundary (resources, exports).

## Links

- [SECURITY.md](../SECURITY.md)
- [collections-and-resources.md](../design-docs/collections-and-resources.md)
