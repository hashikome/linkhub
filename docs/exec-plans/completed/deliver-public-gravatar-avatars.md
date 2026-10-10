# Deliver public Gravatar pictures with generated fallback

This ExecPlan is maintained according to `PLANS.md`.

## Purpose / Big Picture

Show the same public profile picture in person profiles, contributor lists and
account navigation. Use Gravatar for an active person's verified email, otherwise
retain the existing deterministic SVG. Settings explains the public picture and
provides an optional way to create or update a Gravatar account.

## Progress

- [x] (2026-10-10) Completed and committed the prerequisite whole-diff review
  (`8e40fb6`), then refreshed the walkthrough pin (`2241b4d`).
- [x] (2026-10-10) Read the existing proxy, repository design and official image,
  hash, LLMS.TXT and profile-API references. Defined visibility/cache boundaries.
- [x] (2026-10-10) Extended the existing resolver and covered eligibility, email
  changes and in-flight account changes with unit and real HTTP regressions.
- [x] (2026-10-10) Added profile pictures and optional Settings guidance using
  existing components, tokens and native links.
- [x] (2026-10-10) Reviewed the complete feature diff, passed canonical verification
  and browser checks, inspected screenshots and updated delivery records.
- [x] (2026-10-10) Prepared the completed, reviewed milestone for commit. The
  walkthrough was swept; its pin refresh follows in the required guide-only commit.

## Surprises & Discoveries

- Avatar requests already use SHA256, a fixed HTTPS origin, `d=404`, bounded
  response bodies, timeout, concurrency and caching. No provider credential or
  profile API is needed for this image-only milestone.
- Existing person profiles have no picture; contributor lists and account menus
  already use the immutable user-ID avatar URL. Settings has no picture editor.

## Decision Log

- Public visibility follows the existing public-person model: any viewer can see
  an active, verified person's Gravatar. Missing, unverified, inactive, suspended
  or deletion-pending accounts receive only the generated icon. Recheck the
  account/email after upstream resolution to discard stale in-flight results.
- Provider choice is optional registration/image management at Gravatar; the
  product-selected resolution order is Gravatar then generated, with no chosen
  image override or additional account requirement. Settings discloses public
  use and email association. Do not infer account absence from a missing image.
- Resolve identity on every request; never cache a user-ID-to-email association.
  Cache only bounded provider images by normalized-email hash. Changed emails
  select a different cache entry; inactive accounts cannot use cached photos.
  Preserve private/no-store HTTP responses and server-only hashes.
- Use Impeccable's product register and Refactoring UI's quiet register, preserving
  the existing typeface, canvas and semantic tokens. Voice: plain, calm, useful.
  Apply the book's hierarchy, spacing and fixed image-container guidance; keep
  the optional provider link visually secondary and use existing focus states.
  All decisions dated 2026-10-10.

## Outcomes & Retrospective

Public avatars and Settings guidance are implemented. The complete feature diff
has completed defect-first review with no actionable findings. Canonical
verification and browser/visual review passed. Rich profiles,
paid entitlements and unrelated identity fields remain outside this milestone.

## Context And Orientation

At the start, `apps/api/src/modules/avatars/user-avatar.service.ts` preferred a stored
HTTPS image, then Gravatar, only for the current user. `gravatar.service.ts` owns
remote image fetching; `avatars.controller.ts` returns bytes or the existing SVG
redirect. The web `Avatar` component uses `/api/v1/users/:id/avatar`. Extend these
rather than introducing another provider resolver or exposing email hashes.

## Plan Of Work

Record ADR-0034 and update the focused design, then make resolution viewer-neutral
and active-account-only. Keep the existing provider implementation and generator.
Add public profile and Settings pictures, restrained guidance and an optional
external link. Add API/unit regressions and a deterministic provider browser
fixture; test signed-out, signed-in, missing and failed image paths with native
HTML and enhanced clients. Finish delivery documentation and review the diff.

## Concrete Steps

From the root run targeted avatar unit tests, then `bun run verify` in the
isolated checkout under `/tmp/nslinkhub-review-20261010`. Follow sequentially with
`bun run test:browser --test-name-pattern 'Gravatar|account shell and appearance|hubless person|public profile and hub'`.
Use disposable databases and captured email. Render Settings and public profiles
at 390, 768, 1280 and 1440 pixels in both themes; inspect actual screenshots.

## Validation And Acceptance

- Anonymous, own-account and other-account viewers receive the same proxied photo.
- A stored chosen image cannot override Gravatar or its generated fallback.
- Missing images, errors/timeouts, unverified email and unavailable accounts retain
  the generated icon. No third-party image URL or email/hash reaches the browser.
- Email changes and account-state changes during provider resolution discard
  outdated photos; subsequent requests use current identity and state.
- Settings provides optional guidance without claiming the person lacks an account.
  Profiles and contributor/avatar surfaces retain immutable user-ID URLs.
- Canonical checks and relevant browser journeys pass; no actionable review findings.

## Idempotence And Recovery

No schema migration, data reset, dependency installation or provider secret is
required. Tests operate on disposable fixtures. Preserve the development server
and its output; use separate build artifacts. Do not push, deploy, touch sibling
repositories or read the provider secret in `ref/`.

## Artifacts And Notes

Official references checked 2026-10-10:
[LLMS.TXT guide](https://docs.gravatar.com/guides/llms-txt/),
[image requests](https://docs.gravatar.com/sdk/images/),
[hash normalization](https://docs.gravatar.com/rest/hash/), and
[profile API](https://docs.gravatar.com/rest-api/).
The profile API is distinct from image delivery and stays deferred.

Validation evidence (2026-10-10):

- `bun run verify`: passed in the isolated checkout; API unit/integration/HTTP
  tests, boundaries, docs, format/lint, production build and web types passed.
  Log: `/tmp/nslinkhub-gravatar-verify.log`.
- Targeted avatar units: 8 passed, 40 assertions, including provider timeout,
  missing/invalid/oversized images, current eligibility and email association.
- Focused browser journeys: 8 passed, 202 assertions, no failures; profile editing,
  public connections, hubless accounts, appearance and new Gravatar integration.
  Log: `/tmp/nslinkhub-gravatar-browser.log`.
- Final screenshot-only test refinement: 1 passed, 46 assertions. Captures now
  complete CSS transitions instead of sampling intermediate theme colors.
  Log: `/tmp/nslinkhub-gravatar-visual-retry.log`.
- Final read-only review: No findings. Traced public route, provider bounds,
  post-resolution identity check, public profile, contributor and Settings callers.
  Real HTTP races cover changes while the provider is held; tests use disposable
  accounts. Provider fixtures use a valid PNG rather than the older invalid-CRC
  sample. No live personal image or provider account was used.

Visual review used actual rendered captures at 390, 768, 1280 and 1440px in both
light and dark themes. Files are `/tmp/gravatar-profile-{width}-{theme}.png` and
`/tmp/gravatar-settings-{width}-{theme}.png`; generated fallback captures are
`/tmp/gravatar-fallback-settings-{true,false}.png` (JavaScript enabled/disabled).
Representative captures:
[phone profile](/tmp/gravatar-profile-390-dark.png),
[tablet Settings](/tmp/gravatar-settings-768-light.png),
[desktop Settings](/tmp/gravatar-settings-1440-dark.png), and
[native fallback](/tmp/gravatar-fallback-settings-false.png).
These are disposable local evidence, reproducible with the browser test.

The quiet register retains the system sans, neutral canvas and existing semantic
colors. Picture/name hierarchy, mobile stacking and visible keyboard focus work;
long names and email addresses stay contained. The new decision point has one
optional action. No added decorative cards, editor controls or competing primary
actions were needed. Review found no remaining priority visual problems in this
scope. The tablet's narrower Settings column follows the existing layout; a
broader Settings redesign was deliberately not introduced.

Nielsen heuristic scores (0–4 each): status 3, real-world match 4, user control 3,
consistency 4, error prevention 3, recognition 4, efficiency 3, restraint 3,
error recovery 2, help 3; **32/40**. Provider failure intentionally falls back
silently, so there is no provider diagnostic/retry UI. Populated, missing-image,
long-content and keyboard-focus states were inspected; loading/disabled are not
new interactive states here. Provider-page editing and pressed/hover screenshots
were not exercised. The deterministic image fixture validates delivery/layout,
not real-world photographic content. Rich profiles and separate provider controls
remain deferred rather than being implied by this score.

## Interfaces And Dependencies

Keep immutable UUID URLs, backend eligibility, the generated SVG contract,
128px G-rated image requests, 256KB body cap, 1.5-second timeout, 16 concurrent
provider requests and 128 cache entries. Existing TTLs are one hour for images,
15 minutes for missing images and one minute for failures. No new wire fields.
