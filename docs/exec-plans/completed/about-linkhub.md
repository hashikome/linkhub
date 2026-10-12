# Give LinkHub a useful About collection and quieter footer

This ExecPlan is maintained according to `PLANS.md`.

## Purpose / Big Picture

Visitors can open About LinkHub from the footer, find Support and the maker's
portfolio in a small collection, share the product, or join directly. The homepage
keeps its capture action and its example adopts the current reader typography.

## Review correction — 2026-10-12

The user found that About uses separate row markup and the homepage exceeds the
desktop viewport. Reuse the collection heading, sections, rows and details through
a shared preview; real About links must not gain fictional attribution. Fit the
hero and preview to available desktop space, retaining accessible panel scrolling
and normal document flow on small/short screens. Keep footer navigation bottom-left.

- [x] Implement shared presentation and desktop sizing.
- [x] Inspect both themes at 390, 768, 1280 and 1440 px; measure desktop fit through 1920 px and short-window fallback.
- [x] Complete production browser regression checks and the combined verification gate.

## Progress

- [x] (2026-10-12) Confirm scope, existing components and canonical portfolio URL.
- [x] (2026-10-12) Document the decision and implement the About, home and product variants.
- [x] (2026-10-12) Verify native and enhanced navigation, responsive presentation and required gate.
- [x] (2026-10-12) Prepare the completed, uncommitted milestone for review.

## Surprises & Discoveries

- `/about` is already a reserved username, so the route does not claim a profile address.
- Site sharing must keep generating homepage URLs, while its return link now goes
  to About. The existing return-label helper otherwise mistakes `/about` for a profile.

## Decision Log

- Use `/sign-up` for Join LinkHub: the label promises joining, and the homepage
  would add an unnecessary step. Signed-in readers see Discover instead.
- Use the current collection surface, typography and native disclosures for the
  About links. Do not invent timestamps, authors, counts or legal pages.
- Use the existing server-rendered pathname hook for the footer's route variants;
  initial HTML includes the correct links, even with JavaScript disabled.
- Apply Refactoring UI hierarchy, text and spacing guidance and Impeccable's
  brand guidance while retaining the existing font, palette and hero composition.

## Outcomes & Retrospective

The review correction is complete: shared collection presentation, desktop viewport
fit and bottom-left footer alignment are verified. The complete isolated gate
passed; all ten selected browser journeys passed after correcting one stale href
expectation. Mobile/zoom document scrolling and desktop keyboard panel scrolling
remain available.

The initial implementation was verified before the review correction above. The About page, route/session footer variants, shared
hero, aligned example hierarchy and site-share return are complete. The full
isolated gate passed, followed by six focused production browser journeys (134
assertions, zero failures), including JavaScript-disabled and signed-in variants.
No commit or push has been made. Existing uncommitted reader/device work and the
unrelated generated next-env change remain preserved.

The main review correction was target sizing: using the shared desktop control
height alone left a tablet footer link at 38 px, so the footer now has its own
44 px minimum. No new backend behavior or package dependencies were needed.

## Context And Orientation

The root layout owns the shared footer. `app/page.tsx`, `LandingQuestions` and
`CollectionExample` own the homepage composition. `ResourceSections`,
`ResourceLink` and `ItemDisclosure` provide collection semantics and progressive
interaction. Existing local reader changes remain in this working tree.

## Plan Of Work

Record ADR-0056 and update product/interface/design contracts. Extract the shared
hero, add a real About link collection, and replace footer utilities with the
agreed route/session variants. Update the example hierarchy and sharing return
label. Adjust affected browser expectations and exercise the complete journeys.

## Concrete Steps

From the repository root, run formatting and boundary/document checks, then
`TMPDIR="$PWD/test-results/t" bun run verify:isolated` and a focused isolated
production browser suite. Capture home/About/product pages at 390, 768, 1280 and
1440 pixels, in both themes, including reduced motion and native-only behavior.

## Validation And Acceptance

- Product footer: About LinkHub left, body-size tagline right, no year/divider.
- Home footer: About LinkHub only. About footer: Join LinkHub to `/sign-up`, or
  Discover to `/discover` for signed-in visitors; no tagline on either page.
- About retains the hero headline, three follow-up prompts and Share LinkHub CTA.
- Support navigates internally; portfolio respects the per-device tab setting.
- Share generates the homepage URL and returns to About. Native disclosure and
  navigation work without JavaScript. Headings have a coherent semantic hierarchy.
- Both themes remain readable, keyboard operable and free of horizontal overflow.
- Required verification and focused production browser checks pass.

## Idempotence And Recovery

No migrations or external writes. Use isolated verification; do not interrupt the
user's ports 3004/4004 or build into their `.next`. Preserve unrelated local edits.

## Review-correction evidence

`test-results/about-fit/fit.log` records 28 route/theme/viewport combinations,
including desktop heights 700, 800, 900 and 1080, with no document overflow at
desktop sizes. Footer links align with the hero’s left edge. Screenshots inspected
at 390, 768, 1280 and 1440 px in both themes. The accepted constraint is internal
resource-panel scrolling when the desktop window cannot fit all expanded content;
small/short windows use document scrolling. No text is shrunk to force a fit.
Shared heading/section/row/details components replace About’s separate markup.
The visual review retains the existing restrained typography and interaction
patterns (Refactoring UI hierarchy/layout and taste-layer interaction guidance).
Current scope score 18/20: the separate About markup and page overflow are fixed;
internal scrolling on short desktop windows remains the explicit tradeoff.

## Artifacts And Notes

`verify.log` records the full required gate passing (API unit/e2e, 41 web tests,
263 web assertions, production build and typecheck). A final 44 px footer CSS
adjustment and documentation corrections are covered by the current browser build
and repeated formatting/boundary/document checks. `browser.log` records six
production journeys passing; the isolated wrapper cleaned up its owned servers,
database and build checkout.

Evidence lives in ignored `test-results/about-linkhub/`. `preview.log` records
24 passing themed viewport checks across home/About/Support at 390, 768, 1280
and 1440 px, plus keyboard/native disclosures, share return and external tab
preference. `motion.log` confirms rotating questions keep the CTA stationary,
resource titles turn blue after their hover transition, and portfolio clicks
open a new tab while leaving About available. Screenshots include expanded/collapsed states. A 38 px tablet footer
target found during inspection was corrected to a 44 px minimum at every width.
Visual self-review: hierarchy, spacing, type, contrast and native interactions
remain consistent with the existing design. Scope score: 18/20 (subjective, not
an accessibility certification); the accepted tradeoff is one extra step to
Support. Loading/error/disabled states stay with the existing Share flow; the
About collection is static and does not invent loading or empty states.
Nielsen self-review, 33/40: status 3, real-world language 4, user control 4,
consistency 4, error prevention 3, recognition 3, efficiency 3, minimalism 4,
error recovery 2, help 3. This scores the changed surface; shared backend/share
failure handling was not redesigned. The footer target-size issue is fixed.
The accepted low-severity tradeoffs are the extra step to Support and retaining
the established typing animation (with static alternatives). Screenshots judged:
`about-{dark,light}-{390,768,1280,1440}.png`, the corresponding home/Support
captures, and `about-expanded-{dark,light}.png`.
Portfolio canonical URL verified from the sibling portfolio's `src/_data/site.json`.

## Interfaces And Dependencies

No new packages or API contracts. About content is presentation-owned; existing
site sharing, session resolution and ResourceNavigationProvider remain authoritative.

Verification update (2026-10-12): `test-results/email-code-default/verify-final.log`
records the complete isolated gate passing, including API typecheck/unit/e2e,
41 web tests, production build and web typecheck. Production browser checks are complete: nine passed in `test-results/about-fit/browser.log`,
and the corrected About assertion passed in `test-results/about-fit/browser-final.log`.
No commit or push.

The combined production browser run passed nine of ten journeys, including the
new viewport/structure regression, homepage/native interactions, reader polish,
sharing and all four authentication flows. Its only failure was an old exact href
expectation without the trailing slash now supplied by the shared URL parser.
That assertion is corrected; the focused About navigation rerun passed (native
and enhanced, signed-out and signed-in). Evidence: `browser-final.log`. All ten
selected production journeys are now verified. Owned verification processes have
ended, and the isolated wrappers removed their databases and checkouts.
