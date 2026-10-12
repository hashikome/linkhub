# Curated guides and product positioning

Status: Accepted product direction, 12 October 2026.

ntumie. helps people turn useful resources into ordered, maintained collections
that others can understand, explore and share. Its unit of value is the collection:
why these resources belong together, where a reader can begin, and how the guide
stays useful as its owner or contributors improve it.

[PRODUCT.md](../../PRODUCT.md) remains the product authority and owns delivery
status. This document develops its Guides North Star into a reference for product
choices and public language. [ADR-0058](../engineering-decisions/0058-curated-guides-positioning.md)
records the decision. This clarification does not add a release milestone or
change access, pricing or implementation contracts.

## The experience we are building

A person has already spent time finding useful material. They select resources,
put them in a meaningful order and explain their relationship. A reader can use
that work to find a starting point, follow a topic or solve a problem without
reconstructing the curator's search history.

A collection can bring together articles, videos, tools, documentation and other
collections. Sections and descriptions explain the arrangement. Discussion lets
readers ask questions about the guide, and authorized contributors can help keep
it useful. One durable address lets people return to the maintained collection.
Private collections and selective sharing remain valid uses alongside publication
and discovery; public discovery never changes a collection's access policy.

For example, a backend guide might introduce storing data, explain when a reader
would consult that section, and arrange a database manual, a practical tutorial
and a diagnostic tool beneath it. The curator supplies the selection and context;
the resource authors still supply their work at the destination sites.

Saving is the entry action. The experience should help the owner make something
worth returning to and help a reader recognize why it is worth their time.

## What the GoodLinks discovery clarified

Paul arrived at the candidate name Goodlinks through the existing slogan,
“Good links belong together.” A domain search led him to GoodLinks, an existing
product. That discovery prompted a comparison of the experiences each product
emphasizes. It does not establish the other creator's reasons for choosing the
name or imply a shared founding story.

GoodLinks describes a product for saving and organizing articles to read later,
with a clean reading experience, offline access, highlights, notes and iCloud
sync. It supports tags, search and exporting, and its native applications serve
Apple devices. These are documented product capabilities, not findings from a
hands-on evaluation. [GoodLinks press kit](https://goodlinks.app/press/)

GoodLinks also supports sharing links and sending content to other apps. Our
positioning must acknowledge that overlap. The distinction is an emphasis on
maintained guides and the relationships between resources; it is not a claim that
other products cannot organize or share. [GoodLinks product page](https://goodlinks.app/)

| Question | GoodLinks' published emphasis | the product's accepted direction |
| --- | --- | --- |
| What does someone keep? | An article and its reading context | A collection of related resources |
| What supplies context? | Tags, highlights and personal notes | Deliberate order, sections, descriptions and discussion |
| What journey leads the presentation? | Save an article and return to read it | Discover or receive a collection, understand its purpose and explore |
| What should remain useful? | A personal reading library | A guide its owner and contributors can maintain |

The GoodLinks column interprets the material linked above; it is not an exhaustive
feature comparison. Its existence shows another response to a familiar problem.
Demand for the product's particular response still needs to be established through use.

## Decision questions

Use these questions when choosing features, layout and copy:

- Can a reader quickly understand what the collection covers and where to begin?
- Does the arrangement communicate why the resources belong together?
- Does this change make selection, organization or maintenance easier for the owner?
- Can a reader explore a destination and return to the collection comfortably?
- Does sharing preserve the collection's address, current content and access rules?
- Does discovery help someone find useful human curation without inventing quality
  scores, popularity or evidence of demand?

A feature need not answer every question. Its value should connect to a concrete
owner or reader journey. Fast capture, import review and reliable authentication
support those journeys even when they do not appear in the product's headline.

## Consequences for the interface and language

Give collection titles, section headings, section descriptions and resource titles
a clear reading hierarchy. Section descriptions carry authored context and deserve
readable body text. Links should show where they lead, and inline details should
let a reader inspect a resource without losing their place.

The external-link default illustrates this direction: a resource opens in a new
tab so the collection remains available, while the device setting allows same-tab
browsing. Internal navigation stays in the same tab. This is a contextual choice
with a mobile tradeoff, not a rule for every website.

Sharing deserves a clear destination of its own, with a return path to the place
where the reader started. Share activity must retain its existing evidence limits:
a prepared link is not proof it was sent, and a reported opening is not a unique
person. See [sharing](sharing.md).

Public copy can describe selecting resources, giving them order and context, and
finding a guide someone has already put together. “Good links belong together.”
remains the slogan. Avoid promising that every collection is authoritative,
complete or current merely because someone published it.

## Naming and delivery boundaries

The selected product name is **ntumie.**, lowercase with a mandatory trailing
dot in plain text and in the wordmark. The slogan remains **“Good links belong
together.”** The chosen domain is `ntumie.link`.

The name comes from Paul's everyday Swahili exchanges: “nitumie link,” “nitumie
hiyo” and “nimekutumia link check.” In casual usage he writes “ntumie,” dropping
the first “i.” The domain completes the familiar request: “ntumie link.” It fits
the act of asking for a useful collection someone has already put together.

After the GoodLinks discovery, Paul first checked `nitumie`, then `ntumie`.
His registrar screenshot listed both `ntumie.link` and `ntumie.com` as available
at the time. He chose `.link` for its meaning and decided against reserving an
extra domain. This records a choice, not a completed registration or deployment.

[ADR-0059](../engineering-decisions/0059-ntumie-product-name.md) settled the
name. [ADR-0060](../engineering-decisions/0060-ntumie-repository-and-branding.md)
subsequently applies it to the app and repository, superseding the earlier choice
to retain the `linkhub` codebase name. The repository and packages use `ntumie`;
the display name is **ntumie.** LinkHub remains in historical accounts and explicit
“formerly LinkHub” introductions. Legacy storage identities are retained to
preserve data; product naming does not change schema, API contracts or routes.

The product remains in development. Existing collection, section, resource,
sharing, discussion and discovery workflows provide concrete examples. Following,
broader notifications, monetization and other planned capabilities retain their status in
[PRODUCT.md §11](../../PRODUCT.md#11-delivery). A narrative about where the product
is heading must not present the entire direction as shipped.
