# Refine the collection reader and utility footer

## Purpose / Big Picture

Preserve the collection reader the user selected as the product's visual reference.
Improve its footer, section hierarchy, discussion readability and input affordances.
Review this milestone before adapting other product screens; no commit or push is
authorized by this design request.

## Progress

- [x] (2026-10-12) Audited source and rendered the public collection at 390, 768,
  1280 and 1440 px. Read Refactoring UI and Impeccable product/audit/polish guidance.
- [x] (2026-10-12) Implemented first footer, tags, discussion and section-type pass.
- [x] (2026-10-12) Re-rendered both themes at all four widths, inspected
  continuous tag wrapping and footer composition, and confirmed native touch
  disclosure and visible keyboard focus without runtime JavaScript errors.
- [x] (2026-10-12) Full isolated standard verification passed, including
  API integration tests, 41 web tests, production build and web typecheck.
- [x] (2026-10-12) Final focused production browser run passed: three journeys,
  zero failures, 113 assertions. Thirteen distinct journeys passed across the
  initial and corrected runs; this was not a full browser-suite rerun.
- [x] (2026-10-12) Recorded audit findings, updated DESIGN/interface contract and
  changelog, and prepared the uncommitted milestone for user review.

## Surprises & Discoveries

- The existing footer gives copyright more prominence than identity, and uses
  13/14/15 px text for closely related secondary content.
- Collection overflow tags only existed in a title tooltip, unavailable to touch
  and ordinary keyboard navigation. Discussion actions hard-code 32 px over the
  shared coarse-pointer 44 px control token; timestamps use a different height.
- User clarified the desired ladder: collection title, section heading, resource
  title. Existing section headings are 20 px beside 18 px resources; section
  descriptions have the same ink as expanded item content.

## Decision Log

- Quiet product register: calm, legible, trustworthy. Retain Schibsted Grotesk,
  light/dark OKLCH roles, inline disclosures and two desktop reading panels.
  Repository identity takes precedence over the skill's generic palette rules.
- Footer: product and slogan together; Share linkhub/Support remain native links;
  copyright recedes. Constrain the separator to the content width. Use the shared
  footer component rather than a reader-only fork; verify its other shell widths.
- Native details disclose extra collection tags without a popover or JavaScript.
  The expanded state is one wrapping list containing every tag, with Fewer tags
  beneath it. Bound its height so large tag sets retain room for reading.
- Reader section titles become 24/32 px, between 30–34 px collection titles and
  18 px resource titles. Markup follows h1/h2/h3 as requested. Section descriptions
  use muted 16 px/1.6, at most 60ch.
  Do not change resource hover, resource order or continuation behavior.
- No new dependencies, data migrations, backend behavior, theme overhaul or
  product-wide screen redesign. User review precedes the later adaptation phase.

## Outcomes & Retrospective

Implementation and verification are complete; awaiting user design review.
No commit or push has been made, and other screens have not been redesigned. The first
browser run passed ten existing journeys; the new fixture used the API field
`description` instead of Prisma `sectionDescription` and published an extra
collection into a count-sensitive fixture. Corrected its field and made the new
fixture private; no application defect was implicated by those two failures.
A subsequent fixture assertion expected `titleOverride` for an external link,
but external titles resolve from link metadata; it now checks the URL fallback.
The new fixture also deletes its collection after use.

## Context And Orientation

`apps/web/src/app/layout.tsx` owns the shared footer. `globals.css` owns semantic
tokens, responsive frames and reader styles. `primitives.tsx` renders tags;
`collection-reader.tsx` opts into tag disclosure. `resource-sections.tsx` uses
native details for section contents; comments use native forms/disclosures.
The development stack on 3004/4004 belongs to the user. Do not interrupt it or
build into its `.next`. Earlier uncommitted milestones remain intact; generated
`next-env.d.ts` is an unrelated preexisting change.

## Plan Of Work

Audit the supplied reader, then apply localized CSS and semantic markup changes.
Inspect actual screenshots and interactions, update existing browser acceptance
plus meaningful tag/touch coverage, and run verification in an isolated checkout.
Promote the accepted visual rules into DESIGN and the interface contract; keep
an honest final audit with remaining limitations in this plan.

## Concrete Steps

From repository root:

```sh
TMPDIR="$PWD/test-results/t" bun run verify:isolated
TMPDIR="$PWD/test-results/t" bun run verify:isolated test:browser --test-name-pattern 'reader polish|readiness available|fits desktop collection|folds the collection|creates sections|discussion'
bun run check:docs
bun run check:guide-pin
git diff --check
```

Browser scripts in ignored `test-results/reader-audit/` inspect public development
content without mutations. Production journeys own isolated fixtures.

## Validation And Acceptance

Footer fits 390/768/1280/1440 px and 320 px reflow; readable text and visible
keyboard focus in both themes. Desktop retains its bounded resource/discussion
panels, mobile uses document scrolling. Section/type ladder is perceptible.
Extra tags open/close using keyboard and touch, including with JavaScript off.
Discussion controls use 44 px coarse-pointer targets and align with timestamps.
Existing sharing/support navigation and native comment workflows still work.

## Idempotence And Recovery

No migrations or destructive actions. Repeat checks using the isolated wrapper;
never terminate unrelated servers. Revert only this milestone's hunks if needed,
not entire files shared with earlier uncommitted work.

## Artifacts And Notes

Before screenshots: `test-results/reader-audit/before-{390,768,1280,1440}.png`.
Standard gate: `test-results/reader-audit/verify.log` (exit 0).
Initial browser regression runs: `browser.log` and `browser-final.log` in the
same directory. Final focused run: `browser-confirmed.log`.

Rendered screenshots in that directory: `after-{dark,light}-{width}.png`,
`tags-{dark,light}-{width}.png`, `footer-{dark,light}-{width}.png`, where width is
390, 768, 1280 or 1440. `native-touch-tags.png` verifies the no-JavaScript view;
`keyboard-tags.png` and `keyboard-footer.png` show actual navigation focus.
`measurements.json` contains sampled contrast and horizontal-overflow checks.
No physical-device or screen-reader session was available; Chromium emulation
and source/native semantics are the scope of the accessibility evidence.

## Interfaces And Dependencies

No API contract change. Native links, details/summary and forms stay authoritative
for no-JavaScript use. Authorization and fresh-document behavior are preserved.

### Audit findings and resolution

The selected design passes the product anti-pattern check: the reading task owns
space, the disclosure surfaces communicate state, and decoration does not replace
useful content. Quiet register, existing face and palette are retained. The reader
had inherited the landing demo's broad shadow in light mode; remove that shadow
from the reader only, keeping its existing boundary and the landing demo elevation.

| Priority | Finding / impact | Location and resolution |
| --- | --- | --- |
| P2 | Section and resource titles had little visual distinction and shared h2 semantics, making the outline harder to scan. | `primitives.tsx` now uses h3 for resource titles. Reader-specific section styles in `globals.css` use 24/32 px; descriptions have muted ink, 1.6 leading and 60ch measure. Refactoring UI: Separate visual hierarchy from document hierarchy; Designing Text. |
| P2 | Hidden tags required a mouse tooltip; touch/keyboard readers could not reveal them. | `Tags` and `collection-reader.tsx`: native details, continuous wrapping all-tag list, collapse action beneath it, bounded keyboard-scrollable overflow. Taste §5, progressive disclosure. |
| P2 | Discussion actions forced 32 px touch targets and misaligned with 38/44 px timestamps. | `globals.css`: actions use shared button-height tokens, minimum touch widths, aligned timestamps; comment body uses 16 px/1.6. Impeccable product register, interaction consistency. This is a product 44 px target issue, not a claim that every 32 px target violates WCAG AA. |
| P3 | Footer copyright led the identity and supporting text used three close sizes. | `layout.tsx` and footer CSS: wordmark/slogan grouped, utilities at 14 px, secondary copyright, content-width divider, explicit phone/tablet/desktop layouts. Refactoring UI: Emphasize by de-emphasizing; Avoid ambiguous spacing. |
| P3 | Reader reused the floating demo shadow, creating unnecessary elevation in the light theme. | `globals.css`: reader-specific shadow removal; existing border remains. Refactoring UI: Use shadows to convey elevation; Impeccable anti-pattern pass. |

No P0/P1 issue was confirmed in this scoped audit. Five findings (three P2, two
P3) addressed. Existing native forms, selected-item deep links, explicit error
recovery, blue resource hover and automatic desktop continuation are retained.

### Scoped scoring

These are reviewer judgments about this surface, not accessibility certification
or a new performance benchmark. Final verification evidence is recorded above.

| Dimension | Before | After | Evidence / limit |
| --- | --- | --- | --- |
| Accessibility | 2 | 3 | Native disclosure and h1/h2/h3; keyboard checks. No physical screen-reader session. |
| Performance | 3 | 3 | No dependencies, requests or client state added; bounded tags. No new speed benchmark. |
| Responsive design | 2 | 3 | Four visual widths, 320 px reflow, coarse-pointer controls; emulation, not physical devices. |
| Theming | 4 | 4 | Existing semantic tokens; sampled rendered text ratios at least 6.51:1 light and 7.79:1 dark. |
| Anti-patterns | 3 | 4 | Preserve intentional structure; remove reader's inherited decorative shadow. |
| **Total** | **14/20** | **17/20** | **Good; bounded scope and verification limitations remain explicit.** |

Nielsen review (0–4 each): status 3, real-world match 4, control/freedom 4,
consistency 4, prevention 3, recognition 4, efficiency 3, restraint 4,
error recovery 3, help 3 = **35/40**. Scores include established reader behavior;
they do not claim this CSS/markup pass retested every authorization/error path.

Positive findings to carry into later screens: typography-led rows with clear
external destinations; inline details instead of modal navigation; meaningful
surface and semantic-color roles in both themes. Cognitive load stays localized:
reader Share/Edit, per-item destination/disclosure/copy, and a separate discussion
workflow. Footer contains two utility destinations; no new promotional actions.

Next phase after user review: adapt other screens using these roles and spacing,
then run a focused Impeccable audit and polish for each surface. Do not infer that
an attractive collection reader means settings, capture or import have passed.

### Footer review correction — 12 October 2026

User review rejected the repeated footer wordmark and then the top divider.
The footer now keeps copyright and the existing tagline together in quiet 14 px
text, with Share linkhub and Support as utilities. Both groups wrap on phones.
The header remains the sole wordmark; spacing separates the footer from content.
This supersedes the earlier footer composition in this plan.

Refactoring UI: Emphasize by de-emphasizing, Avoid ambiguous spacing, Use fewer
borders, and Taste §9 (Distill). Quiet register; existing product face and canvas.
The three corrected problems were repeated brand emphasis, copyright detached
from supporting text, and an unnecessary dividing rule. No controls or
destinations changed. Screenshots at 390/768/1280/1440 in both themes, keyboard
focus, hover, touch targets and no-JavaScript navigation passed; artifacts are in
`test-results/footer-simplify/`. Footer visual review retains the earlier scoped
Nielsen score (35/40); the user preference correction removes decorative weight,
not a previously failing interaction. No physical device or screen-reader run.

A further user request hides the item-copy button until its JavaScript handler is
ready. Clipboard busy/error recovery remains unchanged; the native item-link
fallback remains for JavaScript-disabled browsers. Held-script verification
confirmed no button before hydration and successful copying afterward; native
fallback also passed (`copy-readiness.log`). The expected copied URL includes
both the existing item query and scroll anchor. The refreshed full verification run was interrupted (exit 143) during API e2e;
it did not report a complete pass. Focused browser checks, Biome, documentation
links and whitespace checks passed. Rerun the full gate before committing.

### Section description review correction — 12 October 2026

User review clarified that section descriptions are curator prose people should
read, not metadata. Use the normal body ink token while retaining 16 px regular
weight, 1.6 line height and 60ch measure. This supersedes the earlier muted-ink
choice above; headings retain their larger size and heavier weight. Refactoring
UI: Size isn't everything; Designing Text. Existing metadata remains muted.
Visual checks passed at 390/768/1280/1440 in both themes, including expanded
and collapsed sections. Rendered descriptions match the body color; computed
16 px size, 400 weight and 25.6 px leading are preserved, with no horizontal
overflow. Screenshots and measurements: `test-results/section-description/`.
The focused review found no additional issue in this color-only correction;
scoped design scores remain 17/20 and Nielsen 35/40 from the earlier audit, not
a new whole-product evaluation. The refreshed full isolated gate passed on the
final footer, copy-readiness and section-description changes (exit 0):
`test-results/section-description/verify.log`. This supersedes the interrupted
footer-only gate noted above. API checks, all 41 web tests (263 assertions),
production compilation and web typechecking passed. No commit or push performed.
