# ADR-0019: Copying requires owner permission and source credit

**Status:** accepted; implementation planned with Add to my collection  
**Date:** 2026-10-08

## Context

Collecting useful resources takes work. The product's copying action should
respect the source owner's choice and keep the source's contribution visible.

## Decision

The source collection owner controls whether Add to my collection may copy its
links. Read access and publication do not imply permission to copy through this
feature. The backend enforces permission and source access when copying.
Every allowed copy shows a source-collection reference in the destination's item
list. Credit does not override refusal. Source references use immutable IDs;
permission to copy never grants access to the source collection.

## Rationale

The user explicitly chose owner permission plus mandatory credit. The owner can
refuse even when attribution would otherwise be shown.

## Implementation boundary

This is a requirement for the planned previews/Add to my collection slice, not
an implemented control. It governs the product action; it cannot prevent a
reader from independently saving an external URL. Choose the initial permission
default and treatment of removed/private source labels in that slice; never
expose unreadable source metadata or silently strip attribution.

## Links

- [Product](../../PRODUCT.md#64-link-previews-and-notes)
- [Collections and resources](../design-docs/collections-and-resources.md)
