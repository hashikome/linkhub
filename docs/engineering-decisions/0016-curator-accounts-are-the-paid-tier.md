# ADR-0016: Everyone's library is free; Curator accounts are the paid tier

**Status:** partially superseded by [ADR-0028](0028-free-public-curation-paid-private-sharing.md)
**Date:** 2026-10-08

ADR-0028 replaces the free-private-sharing guarantee and professional-only paid
framing. The authorization, aggregate analytics and human-reviewed AI constraints
below remain applicable. The original decision is preserved as history.

## Context

nslinkhub as built serves anyone who saves and shares links. Most of those
people don't manage links for a living, and a bookmark tool on its own is a
crowded, cheap market. The people with the problem badly enough to pay are
those for whom links are the work: educators and researchers managing a
digital library of links, people running link-heavy learning programs or
communities that hand every member a guide of resources, people who keep a
community supplied with links. "Curator" had been used loosely for every user.

## Options considered

- One product for everyone with paid feature gates.
- A free product for everyone plus an opt-in professional account, like
  business or creator accounts on Instagram, TikTok or WhatsApp.

## Decision

The everyday library — saving, organizing, sharing, publishing, following,
discussion — stays free for everyone. Professional curators opt into a
**Curator account**, which adds the tools their work needs and is what
nslinkhub charges for. "Curator" names that account type; per collection,
owners and editors are contributors. What a Curator account includes and costs
is decided after the everyday product is built:
[monetization.md](../design-docs/monetization.md).

## Rationale

- Charges the people who get professional value, not everyone with a link.
- Keeps reading, following and saving free, which is how curators' work
  spreads.
- A familiar model: switching to a business or creator account.

## Constraints to preserve

- Nothing an everyday user has today moves behind the Curator account.
- A Curator account never changes the access model: members-only or paid
  access goes through the collection policy like every other grant.
- Analytics count in aggregate and never track individual readers.
- API access acts as the account through the same API authorization; keys are
  scoped and revocable, never a privileged path. Higher rate limits are a plan
  setting, never an exemption from them.
- AI curation proposes; people decide. Its results arrive as a reviewable
  draft (ADR-0012) and never rewrite titles (ADR-0007).

## Links

- [monetization.md](../design-docs/monetization.md)
- [ADR-0001](0001-drive-tenancy-model.md), [ADR-0013](0013-permission-roles-and-display-labels.md)
