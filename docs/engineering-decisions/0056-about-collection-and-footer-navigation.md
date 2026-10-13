# ADR-0056: About collection and footer navigation

Status: Partially superseded by [ADR-0063](0063-wordmark-footer-and-appearance.md)
Date: 2026-10-12

Brand labels below record the original decision. [ADR-0060](0060-ntumie-repository-and-branding.md)
applies the current ntumie. name; current copy lives in the
[interface system](../design-docs/web-interface-system.md). ADR-0063 supersedes the footer positioning, tagline, size and signed-in About
variant, the repeated hero headline and the omission of simulated About metadata. The About collection and sharing decisions remain accepted.

## Context

The reader's footer repeated branding and utility links. Product review settled
on a quieter footer and a useful About page that demonstrates LinkHub's collection
format. This replaces the previous footer composition in DESIGN.md and the web
interface/experience documents; it does not change sharing authorization or URLs.

## Decision

- Product pages show About LinkHub on the left and “Good links belong together.”
  on the right, at the body text scale, without a divider or copyright year.
- The homepage has only About LinkHub. About has only Join LinkHub, linking
  directly to `/sign-up`; signed-in readers see Discover linking to `/discover`.
- `/about` reuses the landing hero headline and question animation. Its prompts
  are “Found a good read?”, “Built a useful collection?” and “Know someone who
  would enjoy LinkHub?”. Its main action is Share LinkHub, generating the existing
  site share URL to the homepage and returning to About.
- A minimal collection contains real Support and maker-portfolio destinations.
  It has no fictional attribution or timestamps. Add legal links only when real
  Terms or Privacy pages exist. Own destinations stay in the same tab; external
  destinations respect the device preference.
- Homepage and About share `CollectionPreview`, which uses the same collection
  heading, resource sections, rows and details as the reader. Curated site links
  are presentation data, not fabricated API records.
- Both marketing pages fit available desktop height; resource panels can scroll
  when content needs it. Mobile, short windows and zoom retain document scrolling.
  Their single footer link stays at the bottom-left of the content shell.
- Homepage and About collection typography follows the reader's visual hierarchy.
  Embedded collection headings begin at h2 beneath the hero h1, with nested
  sections/resources using the next levels as appropriate.

## Consequences

Support takes one extra navigation step from product screens, in exchange for
removing permanent utility clutter. Joining from About does not require revisiting
the marketing page. Footer links and disclosures remain usable in initial HTML;
motion has static reduced-motion and no-JavaScript alternatives. No legal content
or new backend collection records are implied by the presentation.
