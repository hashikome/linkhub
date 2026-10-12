# Rename the product and repositories to ntumie.

## Purpose / Big Picture

Apply the selected product name **ntumie.** across the app, email, source packages,
README, technical handbook and portfolio. Use `ntumie` for machine identifiers
and the repository; `ntumie.link` remains the chosen, not yet verified registered,
domain. Explain “formerly LinkHub” and keep the naming notebook related to the
portfolio project. No source publication or deployment is part of this task.

## Progress

- [x] (2026-10-12) Inventory source, handbook and portfolio; snapshot existing dirty source.
- [x] (2026-10-12) Updated source/packages, current authorities and ADR-0060.
- [x] (2026-10-12) Renamed portfolio file/route and handbook chapters; redirects and related drafts verified.
- [x] (2026-10-12) Full isolated product gate, focused production browser tests, portfolio and handbook checks passed.
- [x] (2026-10-12) GitHub and checkout renamed; origin, workspace and registry references repaired; original data preserved and dev restarted.
- [x] (2026-10-12) Changes ready for review; no commit, source push or publication.

## Surprises & Discoveries

The first isolated install hit the /tmp quota; verification was rerun on the
repository filesystem. Chromium then rejected a long temporary socket path;
using the shorter `.tmp` directory resolved it without application changes.
Portfolio tests caught an escaped old URL and a prior no-redirect assertion;
both now reflect the new route and the two deliberate Cloudflare redirects.
Eleventy needed an explicit passthrough entry to emit `_redirects`.

The portfolio and product already have unrelated uncommitted work; handbook has
an edited platform operations chapter. All must be preserved. Existing PostgreSQL
is named `nslinkhub`; renaming its storage would risk the user's library. The
portfolio includes recorded narration mentioning LinkHub; a transcript must not
silently disagree with its recording.

## Decision Log

- 2026-10-12 / Paul: Supersede the prior choice to retain the `linkhub` codebase
  name. Rename repository and portfolio underlying filename, and update handbook
  and README. Display name retains its dot; machine names omit it.
- 2026-10-12 / Codex: Preserve physical database/volume and immutable contracts.
  Preserve historical ADRs/plans as history, explicitly superseding naming rules.
  Redirect the former portfolio address and handbook chapter addresses. Keep the
  notebook drafts unpublished and relate them to the new project address.

## Outcomes & Retrospective

The repository is `hashikome/ntumie` on GitHub and locally. App, package, email
and current documentation branding now use the selected name. The portfolio
uses `ntumie.md` and `/w/ntumie/`, with reciprocal related notebook links and
legacy redirects. Handbook chapters and shared references are aligned.

The complete isolated verification gate passed. Five focused production browser
tests passed. The restarted dev app passed health, home/About, site-share,
sign-in and mobile overflow checks with no page errors. Desktop/mobile views
were inspected; a final copy-only adjustment avoids comma/question punctuation
immediately following the mandatory name dot, with targeted formatting checked.

Development runs again on 3004/4004, with ntumie containers and the original
`nslinkhub_nslinkhub_pgdata` volume. User, hub, collection and resource counts
matched before/after. Physical storage and the legacy seed account remain
compatibility identities; no schema migration, reset or data replay occurred.
Existing editor windows should reopen the renamed checkout. Generated Next.js
dev type references were regenerated normally by the restarted server.

The original rename task ended without a commit, source push or publication. Notebook drafts remain unpublished;
the naming entry will become related public content when explicitly published.
Historical completed plans/ADRs and recorded narration retain prior names.
The commit-preparation follow-up below records source verification and the
walkthrough review for the subsequent commit request.

## Context And Orientation

`package.json` and workspace imports use `@linkhub/*`. `apps/web`, `packages/email`
and API auth/sharing metadata expose the old brand. `compose.yml` owns local
infrastructure. `../handbook` owns MkDocs reading guides and
`../../namestarlit/namestarlit.com` owns Eleventy portfolio content.

## Plan Of Work

Update packages and visible names with separate mappings, then refresh current
docs and record supersession of ADR-0059's implementation boundary. Update
portfolio file, permalink and related references without publishing drafts.
Move handbook chapters and preserve old addresses. Validate each owning repo.
Rename GitHub and local directory only after concrete edits are reviewable; stop
only the identified product development processes if needed for moving the
checkout. Keep original storage and local origins. Repair workspace references.

## Concrete Steps

Run `bun install`, `bun run check:docs`, `bun run check:guide-pin`, and
`bun run verify:isolated`; run focused production browser acceptance. In the
portfolio run content validation and Eleventy public/draft builds. In handbook
run source checks, strict MkDocs build and generated-site checks. Inspect
repository identity, Git remote and local data after the move.

## Validation And Acceptance

Packages compile under `@ntumie/*`; app, auth/email and share metadata show
`ntumie.`. Existing data, ports and auth origins survive. Portfolio serves
`/w/ntumie/` from `ntumie.md`, related drafts point there and remain unpublished;
old project address redirects. Handbook links resolve and preserve legacy entry
paths. Repository is `hashikome/ntumie` and README records formerly LinkHub.

## Idempotence And Recovery

Snapshot is `/tmp/ntumie-rename/before`, excluding ignored secrets. Never reset
worktrees, seed development, remove database volumes or alter remote visibility.
Use hash guards for sibling edits. Rename back only if necessary to recover a
failed move, never overwrite an existing destination. The original rename stopped
before commits or pushes; the subsequent request authorizes source commits.

## Artifacts And Notes

GitHub repository renamed to `hashikome/ntumie`; origin updated, no source push.
Focused production browser acceptance: 5 tests passed, 170 assertions. Portfolio:
7 tests, public and draft builds passed; renamed route, emitted redirects and
reciprocal related links checked. Handbook: source scope, strict build and 49-page
generated-site check passed; release/access test suites also passed. Logs are
under `/tmp/ntumie-rename/`. Existing recorded narration retains its matching
transcript and now identifies LinkHub as the former name.

Source inventory: `/tmp/ntumie-rename/source-names.txt`. GitHub admin access was
verified. Persistent legacy identifiers will be documented as compatibility
exceptions rather than presented as an incomplete brand rename.

## Interfaces And Dependencies

Bun workspace/package names and generated lockfile must agree. Preserve database
schema, API fields, IDs, cookies, RP ID, auth origins, secret keys and dependency
versions. Portfolio related-project references must match its exact permalink.
Handbook's tracked-files allowlist controls both source and Docker context.

## Commit preparation follow-up — 2026-10-12

After regression review, the user requested commits and authoritative current
documentation. Reconciled the PRD, web and email designs, ADR index, documentation
map, verification runbook and unreleased changelog with the implemented name,
About copy, footer differences, ID-only item addresses and completed query batching.
Historical naming remains explicitly historical; storage compatibility identities
remain documented. The walkthrough review includes renamed containers and a link
to volume-preservation instructions for existing checkouts. Its guide-only pin
commit follows the source milestone, as required by the verification runbook.

Fresh acceptance evidence:

- `bun run verify:isolated` passed the full standard gate, including real-service
  API integration tests, all 41 web tests, both builds and typechecks.
- Full production browser acceptance passed 103 journeys and skipped the optional
  performance benchmark. Two old tag-list selectors failed against the implemented
  native disclosure; both assertions were corrected and their focused rerun passed
  (2 tests, 33 assertions). Application behavior did not change during this rerun.
- The development-loop gate initially expected copy buttons in unhydrated HTML.
  Updated it to require their absence, retaining the native-link checks. The
  isolated `test:dev` rerun passed SSR, preview, native authentication, direct API
  CORS and listener-shutdown checks.
- Current documentation links/anchors, whitespace, changed-test formatting and
  API typechecking passed. No actionable application regression was found.

Disposable logs: `/tmp/ntumie-commit-verify.log`,
`/tmp/ntumie-commit-browser.log`, `/tmp/ntumie-commit-browser-retry.log`,
`/tmp/ntumie-commit-dev.log`, and `/tmp/ntumie-commit-dev-retry.log`.
