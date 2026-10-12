# ADR-0059: ntumie. product name and chosen domain

Status: Accepted; retained-codebase and deferred-branding decisions superseded by [ADR-0060](0060-ntumie-repository-and-branding.md)
Date: 2026-10-12

## Context

The GoodLinks discovery clarified the product's emphasis on maintained guides,
but ADR-0058 left its final name open. Paul found a name in the everyday Swahili
request “nitumie link,” often written “ntumie link” in his conversations.
The domain `ntumie.link` carries that phrase into the address of a collection.

## Decision

The product name is **ntumie.** Use lowercase and retain the trailing dot,
including in plain text. Keep **“Good links belong together.”** as the slogan.
Choose `ntumie.link` as the product domain. Although Paul's registrar search
showed both `.link` and `.com` available, he chose to pursue only `.link`.
Domain registration and deployment are not established by this decision.

This supersedes only ADR-0058's open final-name decision. Its positioning remains
accepted. The repository stays `linkhub`; this milestone updates product
references and unpublished notebook drafts only. Applying the name to runtime
copy, emails, metadata or assets is a separate task.

## Consequences

Preserve LinkHub in historical accounts where it was the working name. Keep
existing repository paths, package identities, API contracts, routes and
configuration unchanged. Product naming does not change the immutable IDs or
durable collection addresses.

See [product positioning](../design-docs/product-positioning.md) for the naming
story and the collection's defining value.
