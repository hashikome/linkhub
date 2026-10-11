# Preserve early input and measure production performance

This ExecPlan is maintained according to `PLANS.md`.

## Purpose / Big Picture

People can type a URL and tags as soon as Add a link appears, including before
React attaches handlers (hydration), and preview/save retain that input. Establish
repeatable production measurements before choosing wider latency changes. Repair
browser fixture races and preserve useful, sanitized failure diagnostics.
ID-only collection URLs remain the next separate milestone.

## Progress

- [x] (2026-10-11) Checked handoff, source, local changes, infrastructure and hosted CI.
- [x] (2026-10-11 08:47Z) Reproduced/fixed early URL and tag input; preview/save, native-before-JS and caret coverage pass.
- [x] (2026-10-11 08:47Z) Cooldown/audit fixtures pass; pinned Chromium and sanitized diagnostic tooling implemented.
- [x] (2026-10-11 09:30Z) Completed matched production runs: 60 before + 60 after samples, all API reads successful.
- [x] (2026-10-11 08:47Z) Measured duplicate profile reads and no-store assets; implemented request-scoped reuse and static cache exemption.
- [x] (2026-10-11 09:46Z) Isolated verify, full browser acceptance (97 pass, 0 fail, optional benchmark skipped) and development lifecycle gates passed sequentially. All four capture screenshots (390/768/1280/1440px) reviewed.
- [x] (2026-10-11 09:46Z) Updated changelog, ADR-0054, runbook, durable measurements and handoff for the original milestone.
- [x] (2026-10-11 10:19Z) Patched both P2 review findings; focused continued-typing and real runner-timeout/late-success regressions pass, as does isolated verify.
- [x] (2026-10-11 11:01Z) Re-established full browser acceptance: 98 pass, 0 fail, 1 optional benchmark skip, 1,966 assertions on a short disk-backed TMPDIR.
- [x] (2026-10-11) Combined isolated standard gate passed after local-port changes; ready for review.

## Surprises & Discoveries

- HEAD and latest hosted run remain bd5f5c0; verify passed, browser reported three failures.
- The tag editor also replaces native input from initial props, risking early tag loss.
- Only pre-existing tracked change is generated apps/web/next-env.d.ts; preserve it.
- PostgreSQL/Redis are healthy. Socket access requires sandbox escalation.

## Decision Log

- Keep native inputs usable before hydration; adopt their live DOM values before
  enabling enhancements. Preserve current design tokens and quiet product register
  (Schibsted Grotesk, existing canvas). Readiness follows the taste layer's
  interaction-state guidance; no visual redesign is needed. Date: 2026-10-11.
- Keep ADR-0048 navigation and fresh authorization. No global client navigation,
  private-response caching, URL removal, branding or deployment work. Date: 2026-10-11.
- Browser checks stay a separate required web milestone/CI gate; do not extend the
  pre-push hook silently. Date: 2026-10-11.

## Outcomes & Retrospective

Original milestone and both review corrections are implemented. The full browser
gate now passes (98 tests) using a short disk-backed temporary root. Combined
standard verification after the local-port changes also passes. Matched results below
show substantial warm-load improvement under controlled throttling, with cold-load
work recorded separately. Changes remain uncommitted for milestone review.

## Context And Orientation

`apps/web/src/components/capture-links.tsx` derives previews from React state;
`tag-input.tsx` replaces a native comma-separated field with chips. Their server
HTML is editable before state is connected. `apps/api/test/browser/reading.browser.ts`
uses Bun's test runner with Playwright against disposable API data and production
Next output. `tooling/verify-browser.ts` owns the build/database lifecycle;
`tooling/verify-isolated.ts` snapshots changes without touching active .next output.
The shared layout already reads session/profile/theme concurrently. Settings has
an additional independent profile read; measure it before consolidating.

## Plan Of Work

Add deterministic held-script input coverage, fix adoption and JS-only readiness,
and correct fixture cooldown/navigation observations. Add sanitized diagnostics
outside temporary checkouts and a repeatable optional measurement journey using
the existing isolated fixture. Measure first byte, asset transfer, component
readiness, API durations/counts and repeated document navigation. Capture ordinary
and controlled network/CPU conditions, document environment and limitations.
Only apply small, evidence-supported optimizations in this milestone.

## Concrete Steps

From the root, use focused `bun run verify:isolated test:browser -t <pattern>` runs,
then `bun run verify:isolated` followed by `bun run verify:isolated test:browser`.
Use Playwright's pinned Chromium; explicit BROWSER_CHROME_PATH remains available.
Never build in the development checkout or reset its database.

## Validation And Acceptance

- Input typed while scripts are held survives hydration, previews and saves,
  including tags; native submission and existing normal capture coverage pass.
- Account confirmation advances only its own fixture cooldown and verifies sending.
- Audit checks wait for the destination/styles and still detect persistent overflow.
- Local and CI default to identical pinned Chromium; sanitized artifacts survive CI.
- Repeated production results include fixture size, cache meaning, slow conditions,
  resource/API timing and limitations; any improvement has before/after evidence.
- Both complete gates pass. Document remaining measured bottlenecks.

## Idempotence And Recovery

All tests own disposable databases and synthetic accounts. Temporary builds are
independent. Preserve generated next-env.d.ts and all personal ref inputs. Test
artifacts must omit credentials, captured codes and real content. Rerun a failing
fixture with a new disposable database; never reset the development database.

## Artifacts And Notes

Starting evidence: ref/next-session.md and ref/ci-verification-investigation.md;
the durable causal findings and scope are captured here. CI run 38110608091.

## Interfaces And Dependencies

Bun 1.3.14, Playwright 1.63.0 Chromium, Next production server, React, PostgreSQL 18
and Redis 7. API policy/session boundaries and native form contracts remain intact.

### 2026-10-11 implementation evidence

The held-script regression failed against original input components (visible URL,
no preview; tags disappeared), then passed after adoption, including a native
save with scripts still held. Account cooldown and audit filter/layout regressions
passed; existing owner/contributor JS/no-JS capture coverage passed. Reviewed
390/1440px screenshots and retained 768/1280px captures for final review.

Measurements exposed actual `private, no-store` JS/CSS headers and two `/profile`
reads on capture and Settings. Scope now includes narrow immutable-build-asset
caching and request-scoped profile-result reuse, under ADR-0054. No navigation
policy or content caching changes. The measurement navigation fixture initially
selected a collection hidden by desktop pagination; corrected to follow a visible
collection link and persist each sample even if later actions fail.

The initial optimized benchmark hit the real 300/minute read budget after dozens
of rapid reloads (observed 429 on `/profile` and avatar). Benchmark samples now
reset only their disposable database's request budgets and reject failed API
reads. Repeating the before/after runs independently with identical 26-collection,
22-resource starting fixtures; discard the incomplete earlier measurements.

### Production measurements (2026-10-11)

The [120 individual samples](../completed/production-performance-2026-10-11.csv) retain document, paint, asset and API timings. Before/after use the same instrumented harness and fixed input-correctness changes; the before build restores only `next.config.ts`, `session.ts`, `capture-form.tsx` and `settings/page.tsx` from bd5f5c0. Both runs pass with 60 successful samples, three per condition, using 26 owner collections and 22 initial resources. Saving adds one resource per repetition.

Environment: Bun 1.3.14, Next 16.3.8 webpack production, Playwright 1.63.0 / Chromium 153.0.8010.12 (full Chromium channel, headless), Linux 7.0.0-34-generic, 11th Gen Intel(R) Core(TM) i7-1165G7 @ 2.80GHz (8 logical CPUs). Browser viewport 1280×720. Loopback ingress forces identity encoding; there is no TLS/CDN or external metadata/email worker. The server stays running; cold/warm describe the HTTP browser cache, not server/database cold start. Backend traffic remains local; the controlled browser settings are 150ms latency, 200,000 bytes/s download, 93,750 bytes/s upload, 4× CPU slowdown. Budget resets happen before timing each disposable fixture sample.

Values below are median milliseconds for the shared document-handler readiness mark (`app:document-ready`), not completion of every component. Each cell is **before → after**. No latency thresholds are added to acceptance tests.

| Journey | Ordinary cold | Ordinary warm | Throttled cold | Throttled warm |
| --- | ---: | ---: | ---: | ---: |
| open-hub | 338 → 375 | 199 → 156 | 4126 → 4011 | 3809 → 512 |
| capture | 176 → 185 | 201 → 144 | 3741 → 3674 | 3711 → 437 |
| collection | 251 → 294 | 232 → 196 | 3968 → 3890 | 3922 → 644 |
| settings | 169 → 170 | 199 → 130 | 3966 → 3845 | 3952 → 600 |
| navigate-collection | — | 209 → 204 | — | 3942 → 780 |
| save-link | — | 316 → 250 | — | 4104 → 792 |

First byte and resource separation (after, medians in milliseconds; slow warm reads):

| Journey | First byte | Document received | Contentful paint | Shared handlers ready | JS / CSS transferred |
| --- | ---: | ---: | ---: | ---: | ---: |
| open-hub | 56 | 332 | 308 | 512 | 0 / 0 bytes |
| capture | 47 | 272 | 288 | 437 | 0 / 0 bytes |
| collection | 84 | 444 | 276 | 644 | 0 / 0 bytes |
| settings | 29 | 417 | 240 | 600 | 0 / 0 bytes |
| navigate-collection | 91 | 445 | 300 | 780 | 12918 / 0 bytes |
| save-link | 260 | 622 | 492 | 792 | 0 / 0 bytes |

Before the change, every warm visit transferred roughly 483–496kB of JavaScript, 74kB of CSS and 47kB of font data, with actual `private, no-store` asset headers. Afterward hashed build assets have `public, max-age=31536000, immutable`; warm reload JS/CSS transfer is zero. Capture and Settings each read `/profile` once instead of twice. The profile timing columns record cumulative backend work, not added critical-path latency (parallel work overlaps).

The important measured gain is repeat asset reuse under throttling. Ordinary loopback differences are small/noisy; three samples do not justify a broad percentage promise or production SLO. Cold throttled visits still spend several seconds receiving and processing the initial assets. Next work: validate compressed transfers on the eventual real ingress, inspect the largest framework/shared chunks and render-blocking CSS before considering selective navigation. Current full document navigation, fresh authorization, no-JS behavior and private-response no-store remain intact. No production-versus-development timing comparison was made.

### Onboarding review

Reviewed guide Sessions 1, 5 and 6 against the updated verification runbook and
interface boundary. Added explicit pinned-Chromium installation and clarified the
separate browser gate in Session 6. Keep those guide edits for the required
guide-only commit: after the reviewed implementation commit exists, advance the
pin to it. The pin cannot name uncommitted working-tree changes.

### Full-gate findings (2026-10-11 09:10Z)

`bun run verify:isolated` passed. The first full browser run exposed two remaining
unscoped account error locators: both matched Next's route-announcer alert as well
as the correct product notice. Scoped them to `main`, matching adjacent tests.
The new diagnostic pipeline retained both sanitized traces, waterfalls and
fixture status outside the disposable checkout; correctly omitted account-page
screenshots. Run the browser gate again after the selector correction.

### Browser runtime finding (2026-10-11 09:25Z)

The second full gate passed both corrected account tests, but recorded a page
crash and a browser-error navigation in two other journeys. The host kernel
recorded a compositor trap inside `chrome-headless-shell`. Switched both local
and CI defaults to pinned full Chromium in headless mode; added sanitized failed
request codes to the waterfall. Repeat focused journeys, measurements and gates
with this browser mode.

### Completion evidence

Final sequential commands passed:

- `bun run verify:isolated`: all standard checks, API/web suites, production build and type checks.
- `bun run verify:isolated test:browser`: 97 passed, zero failed, one optional
  benchmark skipped; 1,956 assertions. Full pinned Chromium completed without the
  headless-shell compositor crash. Held-JavaScript capture, native submission,
  profile isolation, immutable assets and sanitized diagnostics passed.
- `POSTGRES_VOLUME_NAME=nslinkhub_nslinkhub_pgdata POSTGRES_VOLUME_EXTERNAL=true bun run verify:isolated test:dev`:
  real dev startup, ready URL, native entry links, direct API/CORS and shutdown.
  The explicit volume settings preserve this host's existing infrastructure; other
  contributors should use their own configured volume, never copy this host name blindly.

Both matched production runs passed independently with full Chromium; the CSV
and tables above supersede the earlier headless-shell samples. Diagnostic
retention was exercised by actual failing runs and inspected after temporary
checkout removal. The final successful suite removes its temporary evidence.

All changes remain uncommitted for review, with the pre-existing generated
`apps/web/next-env.d.ts` change preserved. No remote CI run has tested this diff
yet. After review: implementation milestone commit, then the required guide-only
pin refresh commit and push according to repository policy. ID-only URLs are the
next separate implementation milestone.

### Review corrections in progress (2026-10-11)

Review identified continued typing corruption in an adopted comma-containing tag
draft and lost diagnostics when Bun itself times out a test. Preserve the adopted
draft until an explicit delimiter/Enter/blur commit. Move diagnostic finalization
to Bun's `onTestFinished`, snapshot whether the body completed successfully, and
keep per-test context ownership with AsyncLocalStorage so late completion cannot
remove another test's evidence. Add a held-script continued-typing regression and
a child-runner timeout/late-success retention regression. The focused held-script continued-typing/save regression and all three diagnostic
tests pass, including a real Bun timeout whose body later succeeds. The standard gate subsequently passed; full browser results are recorded below.

### Review-correction validation (2026-10-11 10:19Z)

- `bun test ./test/browser/browser-diagnostics.browser.ts` from `apps/api`: all three
  tests passed. The child Bun runner deliberately fails one ordinary test and one
  1-second timeout; the timed-out body later succeeds. Both retain sanitized
  traces, passing-test evidence is absent, and the typed secret is excluded.
- Held-JavaScript capture: focused production regression passes, including
  `first, par` → continued `tial` → `first, partial`, an explicit comma commit, a
  subsequent normal tag, persisted tags, caret preservation and native save.
- `bun run verify:isolated` passed after correcting CommonJS paths in the new
  regression. An intermediate run hit the unchanged audit-pagination fixture's
  final-cursor assertion; it passed unchanged on rerun. Its relative 1ms timestamp
  window may overlap earlier events; this is a follow-up hypothesis, not a proven
  pagination defect.
- Full browser attempt: 25 passed, 73 failed, one optional benchmark skipped.
  Retained waterfalls include `net::ERR_INSUFFICIENT_RESOURCES`; multiple pages
  crashed and screenshots failed. A diagnostic rerun with `DEBUG=pw:browser`
  recorded Chromium's GPU process exiting unexpectedly (exit code 9) and a Mojo
  validation error. In that rerun both requested regressions passed again; the
  opening screenshot/layout journey crashed. No assertions or timeouts were
  weakened to conceal this. The full gate remains outstanding.

Evidence logs: `/tmp/linkhub-review-verify-rerun.log`,
`/tmp/linkhub-review-diagnostics.log`, `/tmp/linkhub-review-capture.log`,
`/tmp/linkhub-review-browser.log`, `/tmp/linkhub-review-browser-debug.log`.
Sanitized failure artifacts survived isolated checkout cleanup under
`test-results/browser/2026-10-11T10-14-04.560Z/` and
`test-results/browser/2026-10-11T10-18-20.521Z/`. The later recovery evidence below supersedes this gate status. Changes are uncommitted. ID-only URL implementation has
not started.

### Browser recovery (2026-10-11 11:01Z)

With `TMPDIR=$PWD/test-results/t`, the complete production browser gate passed:
98 tests, zero failures, one optional performance benchmark skipped, 1,966
assertions in 556.99s. Both review regressions passed in this full run. An
independent direct-API topology run passed all four focused journeys (101
assertions). Logs are `test-results/ports-browser-full.log` and
`test-results/ports-browser-direct.log`. The earlier failure record above remains
historical evidence, not the current gate status.

The host's /tmp tmpfs rejected build writes with EDQUOT despite free aggregate
space, and a long alternate TMPDIR exceeded Chromium's Unix socket path limit.
A short directory on the repository filesystem avoids both confirmed constraints.
No other session's files or processes were removed. These observations do not
prove the cause of every earlier GPU/resource failure. The diagnostics regression
now has a `.browser.ts` suffix and explicit browser-runner entry, keeping browser
installation/testing out of standard API test discovery as ADR-0054 requires.

### Final acceptance

`TMPDIR=$PWD/test-results/t bun run verify:isolated` passed in full after the
browser gate: source/documentation checks, tooling/email/API/web tests, production
builds and type checks. Log: `test-results/ports-verify-quiet.log`. No product
assertions or fixture deadlines were relaxed. All implementation remains
uncommitted for review; remote CI has not run this diff. The active development
stack remains on 3004/4004, with existing PostgreSQL/Redis data preserved.
