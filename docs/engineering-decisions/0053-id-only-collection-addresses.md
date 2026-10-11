# ADR-0053: Collection addresses use only immutable collection IDs

**Status:** accepted; implementation pending

**Date:** 2026-10-11

## Context

Collections already have permanent UUIDv7 IDs and `/c/<collectionId>` links.
Handle/slug browse addresses add a second route, per-hub slug uniqueness and
transfer conflicts without an exposed slug-editing workflow. Imports generate
random slugs, so those addresses offer little readability benefit. Collections
can transfer between owners; their addresses should not depend on ownership.

## Options considered

- Retain both ID permalinks and handle/slug browse addresses.
- Put the collection ID under a hub path or in `/@handle?c=<collectionId>`.
- Use `/c/<collectionId>` for all collection navigation and sharing.

## Decision

Use `/c/<collectionId>` everywhere a collection address is emitted. Handles
resolve hub pages only, through `/@handle`; `/h/<hubId>` remains the stable hub
address. Collection addresses contain neither a handle nor a hub ID. Item links
retain `/c/<collectionId>?item=<resourceId>`.

Remove collection slugs, their unique constraint, generation, lookup contracts
and transfer conflicts. This partially supersedes ADR-0002's allowance for
`/@handle/<slug>` browse URLs; all immutable-identity and authorization rules
remain binding. Hub-handle rename and reservation rules are unchanged.

## Rationale

One address survives title changes, hub-handle changes and ownership transfers.
Titles need not be unique. Resolving the collection ID supplies its current hub
and owner, avoiding duplicate routing and artificial transfer conflicts.

## Constraints to preserve

- Stable identity never grants access: current collection policy still applies.
- Transfer preserves the collection ID and its URL, not necessarily a viewer's access.
- Native forms, interrupted-action replay, capture references, exports and item
  deep links must use the same contract.
- Under ADR-0006's pre-deployment policy, remove obsolete routes outright rather
  than adding alias redirects. Preserve existing collections, IDs and resources;
  no development database reset is part of this work.
- The decision is accepted now; existing slug behavior remains until the linked
  implementation plan is completed. Do not describe removal as shipped yet.

## Links

- [Immutable identities](0002-immutable-identities.md)
- [Pre-deployment policy](0006-pre-deployment-no-compat.md)
- [Identity and URL design](../design-docs/identity-and-handles.md)
- [Implementation plan](../exec-plans/active/use-id-only-collection-addresses.md)
