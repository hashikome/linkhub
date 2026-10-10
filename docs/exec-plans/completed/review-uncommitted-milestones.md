# Review and commit the accumulated milestones

This ExecPlan is maintained according to `PLANS.md`.

## Purpose / Big Picture

Review the accumulated changes against HEAD, resolve confirmed defects, run the
canonical and browser gates, and commit the reviewed development milestones.
Gravatar delivery follows this checkpoint. Do not push or deploy during this work.

## Progress

- [x] (2026-10-10 00:59Z) Read the handoff and repository authorities; located and
  read the installed `review-agent` skill.
- [x] (2026-10-10 00:59Z) Baseline `bun run verify` passed.
- [x] Complete the first whole-diff review, including untracked migrations,
  source and tests, deleted routes, browser journeys and repository authorities.
- [x] (2026-10-10 01:02Z) Added real-HTTP regressions: both failed before fixes
  (two skipped collections; HTTP 500 for a valid tag), then implemented fixes.
- [x] Re-review both fixes and affected integrations; final whole-diff review:
  no remaining actionable findings.
- [x] (2026-10-10) Final `bun run verify` passed in the isolated checkout,
  including the deleted-anchor regression. Full browser rerun: 68 passed,
  zero failed; the repaired assertion also passed API typecheck and Biome.
- [x] (2026-10-10) Reviewed the staged whole diff and prepared the completed
  checkpoint commit. Only `ref/README.md` is staged from `ref/`.

## Surprises & Discoveries

- P2: `OperationsService.managedCollections` passes millisecond-truncated
  `createdAt` values to the timestamp keyset helper. Three records at
  `.123900`, `.123800`, and `.123700` seconds yield an empty second page after
  the first record. A disposable PostgreSQL reproduction confirmed this.
- P2: the relational tag constraint rejects a valid 80-character input consisting
  of capital dotted I, 77 ASCII letters, a space and another letter. Lowercasing
  expands dotted I; truncation leaves trailing whitespace. Previously arrays
  accepted this value; the new normalized-name constraint rejects the write.
- Staged documentation review caught outdated delivery labels for the completed
  reorder/sharing journeys and a walkthrough checkpoint describing separate
  management consoles. Corrected them to match the reviewed implementation.
- The full browser run exposed a test race: Manage row snapshots captured UTC
  text before hydration and compared it with localized text afterward. Row IDs
  and values were unchanged. Snapshot comparison now substitutes each time
  element's authoritative `datetime`; the dedicated timezone journey continues
  to verify rendered local/UTC text. API typecheck and Biome checks passed.
- The sandbox blocked the standalone database reproduction; it passed with
  escalation using the repository's disposable database lifecycle.

## Decision Log

- Preserve all inherited work and the migration chain. Review intended
  preproduction contract replacements against accepted ADRs, without introducing
  compatibility requirements. Date: 2026-10-10.
- Capture remains owner-scoped: its existing destination query rejects foreign
  collections and the surrounding transaction rolls back implicit hub creation.
  No contributor-capture finding or scope expansion is warranted.
- Account recovery codes are action/account/version/session-bound; shared flow
  validation includes the account action vocabulary. These inspected paths do
  not support the suspected purpose-confusion finding.
- Manage collection pagination uses the database row as its ordering anchor,
  keeping PostgreSQL's full precision and existing authorization filters. A
  removed or inaccessible anchor explicitly returns `invalid_cursor` for reload,
  rather than silently returning an incomplete page. Date: 2026-10-10.

## Outcomes & Retrospective

Review rounds and acceptance are complete. Both confirmed P2 findings were
reproduced through HTTP before correction and pass the isolated canonical gate,
including explicit reload after cursor-anchor deletion. The full browser rerun
passed all 68 journeys (1,170 assertions). The earlier full browser run had
67 passes and the single timestamp-snapshot race described above. Documentation
checks, API typecheck and Biome passed after the final test/document corrections.
Staged source whitespace checks passed; Markdown retains intentional hard breaks.
No remaining actionable findings. The completed review record accompanies the
checkpoint commit; no push or deployment is authorized by this milestone.
Further builds run in an isolated copy under `/tmp` after a host process check
identified the active development server (hidden by the sandbox PID namespace).
The initially attempted browser build was stopped; it is not a passing check.

Review coverage included account proof binding and cleanup, optional-hub creation,
owner/contributor/service boundaries, share-token revocation and continuation,
audit denial transactions, migration backfills/constraints/triggers, relational
tag counts, ordering and section invariants, selected-item reads and native
disclosures, management projections, shared contracts, verification tooling and
documentation. Deferred imports, billing, rich profiles and audit redesign were
not treated as missing implementation. Existing-data schema drift recorded in
the handoff remains a separate local maintenance task; no development data was
reset or reseeded.

## Context And Orientation

The inherited working tree contains 195 tracked changes and 150 untracked files,
covering optional hubs, people, unified audit, sharing, management, sections,
relational tags and self-service accounts. `PRODUCT.md`, `ARCHITECTURE.md`,
`DESIGN.md`, and accepted decisions through ADR-0033 define intended behavior.
Completed plans retain previous milestone evidence.

## Plan Of Work

Inspect the full diff and affected callers, validate findings against requirements,
add behavior regressions, and fix confirmed defects. Re-review changed integrations
and the whole diff before committing. Keep deferred imports, billing, telemetry
redesign and broader UI design outside this review milestone.

## Concrete Steps

Run `bun run verify`, followed sequentially by `bun run test:browser`. Use the
isolated test database runners for targeted API regression checks. Inspect
`git diff --check` and the staged diff before preparing the milestone commit.

## Validation And Acceptance

Manage pagination must return authorized rows exactly once across submillisecond
timestamp boundaries. Valid tags must normalize into values accepted by the
relational constraints. No actionable review findings remain; both required gates
pass on final code. Blocked checks must be recorded as blocked.

## Idempotence And Recovery

Tests use disposable databases and captured email. Never reset the development
database or delete personal import inputs. Do not squash migrations, touch sibling
repositories, push, or deploy. Preserve the existing working tree if interrupted.

## Artifacts And Notes

The review uses `/home/ns/.codex/skills/.system/review-agent/SKILL.md` for defect
criteria and read-only inspection; the handoff separately authorizes fixing
confirmed findings and committing after verification.

## Interfaces And Dependencies

Preserve backend-owned authorization, immutable IDs, collection policy, the
authority transaction, shared wire types, SQL-only invariants and Bun tooling.
