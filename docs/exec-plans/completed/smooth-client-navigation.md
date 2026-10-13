# Smooth client navigation and saves

## Purpose / Big Picture

Internal links, filters, saves and appearance changes keep the browser document
alive. The shell remains usable while server-authorized content loads. JavaScript
is the supported interactive experience; native fallbacks are useful but no
longer a product acceptance requirement.

## Progress

- [x] (2026-10-13) Inspected native links/forms, FreshDocument, existing JSON saves
  and Next.js router behavior. Owner authorized replacing the JS-free constraint.
- [x] (2026-10-13) Implemented client navigation, shared asynchronous forms and instant appearance.
- [x] (2026-10-13) Verified navigation, saves, failures, session changes and history authorization.
- [x] (2026-10-13) Promoted contracts to ADR-0064, product/architecture/design docs
  and the handbook; publication and live acceptance remain separate.

## Surprises & Discoveries

Existing native-form redirects carry sealed flow/draft cookies and provider
redirects. Keep those server contracts; return a JSON continuation to interactive
submissions rather than following a redirect in fetch.

Native form controls named `action` can shadow DOM form properties. The shared
adapter reads attributes so sharing, link rotation and destructive confirmations
keep their intended POST destinations. Browser helpers now await visible completion
rather than assuming a click waits for a document load. Persistent shell components
close menus on navigation and reconcile theme/account state.

## Decision Log

- Use Next.js navigation with no speculative private prefetch. Ordinary page
  reads remain uncached and server-authorized. Refresh after writes and on history
  restoration/session changes. Theme saves update locally with explicit feedback.
- Preserve independently enhanced forms and resource/external/download semantics.
- No automatic retries of uncertain writes. Keep inputs and give a safe way to
  inspect current state before repeating a submission.

## Context And Orientation

`apps/web/src/components/app-navigation.tsx` replaces the former full-document
coordinator. `/forms/[action]` and `/forms/import-start` own app commands; backend
services retain authority. `lib/http.ts` owns browser transport. Existing profile
and import forms already handle some saves asynchronously.

## Plan Of Work

Add shared navigation and form components, enhance redirects without changing
native responses, apply them to current links/forms, and remove routine location
reloads. Update the native-only ADRs and product/architecture contracts. Extend
browser acceptance to assert document identity survives ordinary interactions.

## Concrete Steps

Use `bun run verify:isolated` to protect the running dev server. Run focused
browser journeys with `bun run verify:isolated test:browser --test-name-pattern`.

## Validation And Acceptance

- Internal page navigation and form saves preserve `performance.timeOrigin`.
- Theme switches immediately, survives reload, and reports failed saves inline.
- Modified clicks, external links, downloads and provider redirects still work.
- Back/forward and session revocation refresh authorization before showing stale
  private content. Failed writes retain inputs and never retry automatically.
- Full repository verification and relevant browser journeys pass.

## Idempotence And Recovery

Local code changes only; no real accounts, emails or production data are changed.
Tests use isolated infrastructure. Preserve all prior local UI and release work.

## Outcomes & Retrospective

Internal page links, GET filters, command forms, sign-in continuations and
appearance changes preserve the document. Existing Server Actions and specialized
inline editors retain their own submission handling. Account menus close on route
changes; server-refreshed lists discard obsolete reads. The API remains authoritative.

The full browser run covered 108 cases: 87 passed, one existing case was skipped,
and 20 exposed outdated navigation waits or form/shell compatibility issues. All
20 subsequently passed in focused production-browser reruns after correction. The
last rerun passed 16 tests / 367 assertions, including a new uncertain-submit
regression; earlier focused checks verified document identity, history revocation,
theme persistence, failure rollback and sign-out. Do not describe the initial full
run itself as green.

Handbook source, strict build and generated-site checks passed. Final `bun run verify:isolated` passed, including source checks, unit/API suites,
production web build and typechecking. No commit, push, deployment or live acceptance.

## Artifacts And Notes

Responsive screenshots were inspected at 390, 768, 1280 and 1440 pixels in
`/tmp/ntumie-navigation-review/`; no horizontal overflow. Owner: this milestone;
purpose: local appearance/feedback acceptance; remove after acceptance. Resolved diagnostic runs from this milestone were removed after their failing
journeys passed again; older unrelated evidence was preserved. Durable decisions
and acceptance evidence are recorded here and in ADR-0064.

## Interfaces And Dependencies

Next.js App Router; existing same-origin form endpoints and cookies; React
transitions. No new dependencies or password-manager coupling.

## Benchmark — 13 October 2026

Measurement limitation discovered in the following performance milestone: these
page timings include Playwright assertion polling before completion. Under
throttling, polling can obscure smaller changes. The later
[collection/Settings comparison](faster-collections-and-settings.md)
remeasures both sources with readiness timestamps taken on browser animation
frames; do not directly compare absolute timings across the two methods.

Compared committed source `6fb4cd3b5a96fc1039f9d061d28cd01c777585ec` with the
uncommitted working tree using separate production builds and the same benchmark
harness. The measured after-source manifest has aggregate SHA-256
`4ace331d091991945a55d376b5b2a0ade9dd6b465a0c7b0c182f6caa6fc9a5d5`.
This includes the preceding local UI work, so it is a before/after release
comparison rather than a single-variable experiment.

Ten samples per journey per condition, Chromium 153.0.8010.12, Bun 1.3.14,
Intel Core i7-1165G7 at 2.80 GHz. Real production Next.js/NestJS and disposable
PostgreSQL, synthetic signed-in fixture with 26 collections and 22 source items,
no external email or metadata providers. Runs were sequential on the same
workstation with the owner's development app left running. Server routes were
warm; each repetition used a fresh browser context. Page transitions visited each
destination for the first time in that context, after loading its source page.

Normal conditions use loopback HTTP. Slow conditions add 150 ms browser network
latency, 200,000 B/s download, 93,750 B/s upload and 4× browser CPU throttling.
Both use identity encoding. The click-to-ready clock includes destination
content, shell readiness, fonts and two animation frames; theme feedback and
cookie-confirmed persistence have separate completion checkpoints. Persistence
includes polling overhead. Theme feedback measures applying the selected Light
choice from System; the default device scheme is already light.

Median elapsed milliseconds (before → after):

| Journey | Normal | Slow |
| --- | ---: | ---: |
| Cold homepage entry | 253.4 → 252.9 | 3961.6 → 3958.8 |
| Home → About | 145.9 → 83.8 | 537.1 → 453.8 |
| Hub → collection | 208.0 → 137.3 | 790.2 → 959.4 |
| Capture → Settings | 168.7 → 107.4 | 854.8 → 937.4 |
| Theme feedback | 149.9 → 39.2 | 484.7 → 54.1 |
| Theme saved | 192.4 → 73.9 | 716.4 → 436.2 |

Observed maximum milliseconds (before → after), not a population tail estimate:

| Journey | Normal | Slow |
| --- | ---: | ---: |
| Cold homepage entry | 261 → 284 | 4124 → 4001 |
| Home → About | 170 → 110 | 739 → 476 |
| Hub → collection | 225 → 194 | 940 → 980 |
| Capture → Settings | 218 → 123 | 984 → 968 |
| Theme feedback | 192 → 55 | 577 → 65 |
| Theme saved | 276 → 163 | 808 → 448 |

Normal page navigation medians improve 34–43%, and theme feedback improves 74%.
Slow theme feedback improves 89%, but first navigation to a collection regresses
21% and Settings regresses 10%. The causes of those regressions have not been
isolated. Cold entry is essentially unchanged, including roughly four seconds in
the slow fixture. This does not establish that the owner's earlier three-second
live page loads have been fixed: neither hs nor Cloudflare was measured here.

All 80 measured navigation/theme actions replaced the document before; none did
after (theme feedback and persistence count as one action). Normal navigation
request medians fall from 14–15 to two; completed theme saves fall from 16 to one.
These counts support less repeated page work, but completed-response bytes at a
visual checkpoint are not a full download budget. Ten samples and workstation
conditions do not support broad latency guarantees.

Both production builds and both optional benchmark runs passed. API typechecking,
benchmark-source Biome checks and documentation checks passed. The reusable
entry point is documented in the
[verification runbook](../../runbooks/verification.md#in-app-navigation-comparison);
the harness is `apps/api/test/browser/navigation-performance.ts`. Benchmark tooling
and findings remain local with the application changes; nothing was deployed.

Raw sanitized samples and the source manifest remain in ignored
`ref/navigation-benchmark/`, owned by this completed milestone for reproducibility
and investigating the slow-route regressions. Review/remove them when a follow-up
benchmark supersedes this baseline. The one-off checkout runner was removed after
the permanent harness and results were recorded; isolated checkouts and test
infrastructure were cleaned up.
