# ADR-0031: Direct disclosures without global controls

**Status:** accepted  
**Date:** 2026-10-10  
**Amends:** [ADR-0030](0030-one-selected-item-in-the-url.md), global controls only.

## Context and decision

The product owner found global Expand and Collapse controls unnecessary beside
direct section toggles and one URL-selected item. Remove the toolbar. Readers
open items and toggle sections directly. Reloading restores open sections,
opens the authorized URL-selected item and scrolls it into view using the
existing enhanced/native permalink behavior.

Share and Add a comment are the main viewer actions, subject to existing access
and discussion policy. Owners and contributors also have Edit. Comment ownership
and moderation controls, resource navigation and backend permissions are unchanged.

## Tradeoff

Readers lose one-click global section toggling. A quieter reading surface and
reload-to-default behavior are preferred. Keep native keyboard disclosures and
the collapsed section's Show items cue so hidden content remains discoverable.

## References

- [Collections and resources](../design-docs/collections-and-resources.md)
- [Product](../../PRODUCT.md#63-collections-and-guides)
