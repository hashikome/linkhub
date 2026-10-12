# Record product positioning and consolidate the notebook stories

This ExecPlan follows `PLANS.md`.

## Purpose / Big Picture

Record why maintained collections define LinkHub, then adapt the author's naming,
navigation and sharing experiences into two unpublished portfolio entries.

## Progress

- [x] Read product authority, existing notebook drafts and portfolio writing rules.
- [x] Add focused positioning, ADR-0058, PRD summary, indexes and changelog.
- [x] Prepare two narrative drafts with the author's “New ideas are rare” opening.
- [x] Write and validate the portfolio drafts, preserving original source material.
- [x] Verify project documentation, record evidence and prepare for review.

## Surprises & Discoveries

GoodLinks also organizes and shares links; the comparison must describe emphasis,
not claim exclusive features. The portfolio has unrelated dirty work and two
untracked source drafts, which must be preserved when consolidating them.

## Decision Log

The user approved the briefing and two-entry direction on 12 October 2026.
Retain LinkHub as a working name and the existing slogan. Use primary GoodLinks
material for product facts, without inventing its founder's motivation. Archive
the two earlier source drafts outside Notebook; keep the separate sharing/API
draft unchanged. Drafts stay `published: false`. No product rename or publishing.

## Outcomes & Retrospective

Complete and ready for review. The PRD, focused positioning and ADR-0058 record
the accepted direction and pending name. Two unpublished portfolio entries replace
the overlapping source drafts, with their original text retained in an editorial
archive. The sharing/API draft and unrelated portfolio work remain unchanged.
No commit, push or publication.

## Context And Orientation

`PRODUCT.md` owns the product definition. The focused positioning and ADR record
its rationale. The sibling portfolio is `../../namestarlit/namestarlit.com`, with
Eleventy entries in `src/content/notebook/` and editorial history in `docs/`.

## Plan Of Work

Record product intent; replace the two overlapping notebook drafts with the
approved narratives, archive originals and update editorial references. Build
public and draft output separately and check that the new entries remain private.

## Concrete Steps

Run LinkHub `check:docs`, `check:guide-pin` and `git diff --check`. The full isolated
verification gate already passed immediately before this documentation-only task;
no executable LinkHub behavior changes here. In the portfolio, validate content,
run notebook tests, build public output and a separate draft preview into `/tmp`.
Read back the new entries and inspect their rendered preview.

## Validation And Acceptance

The PRD links to durable positioning. GoodLinks claims have primary references.
No implication of demand, deployment, new identity contracts or a final name.
Both stories retain the author's voice, factual sequence and unresolved choices.
Two new drafts appear only in draft output; the older source drafts remain in an
editorial archive and the technical sharing draft stays unchanged.

## Idempotence And Recovery

Preserve unrelated changes and do not commit or push. Sibling writes require the
tool's filesystem escalation, already within the user's explicit authorization.
Use source hashes to avoid replacing changes made since the initial read.

## Artifacts And Notes

Evidence lives in `/tmp/linkhub-positioning-drafts/`: content validation passed;
`notebook-tests-final.log` records seven passing tests; `public-build.log` and
`preview-build.log` record successful isolated Eleventy builds. The first sandboxed
test run failed without useful per-test output; rerunning with normal filesystem
access passed. Both new slugs are absent from every public HTML page and present
only in the noindex draft preview. `visual-check.log` records rendering at 390 and
1280 px with no horizontal overflow; desktop and mobile screenshots were inspected.
Saved prose was read back, and the technical sharing draft's hash is unchanged.

LinkHub documentation/guide-pin checks and both repositories' whitespace checks
passed. No runtime code changed, so the immediately preceding full isolated gate
was not repeated. The only local browser listener was closed after inspection.
Durable sources, writing boundaries and archived originals live in the portfolio's
editorial plan/backlog and `docs/planning/archive/linkhub-story-source-drafts.md`.

## Interfaces And Dependencies

No dependencies, schema changes, deployed content or runtime changes.
