# Review and import collection drafts

## Purpose / Big Picture

An upload creates collection drafts. Review lists collections, opens one collection
at a time, and queues its ready links for background import. The person can review
another collection while the worker saves bounded batches. Each new collection
has its own Published choice, enabled by default. Existing owner/viewer/contributor,
link grants and publishing rules remain; no new visibility or subscriber model.

## Progress

- [x] (2026-10-11) Confirmed collection review, asynchronous import, and per-collection publishing.
- [x] Removed redundant selected count; Refresh first, Import before Clear selection.
- [x] Complete scoped API, persisted worker jobs and publication preferences.
- [x] Replace file review with collection review and publication controls.
- [x] Validate batching, isolation, native/enhanced forms and interrupted sign-in.
- [x] Run isolated verification, document decisions and update changelog.

## Surprises & Discoveries

The earlier synchronous selected-row proposal was superseded by the user's
collection-draft workflow. Keep the 100-link transaction bound; persist a snapshot
of ready row IDs and let the existing worker continue it. Never make the browser
responsible for finishing a job. Existing imported collections keep their visibility.

## Decision Log

- 2026-10-11: Collections, identified by immutable draft-folder IDs, are review and
  import units. Row selection remains for repair/removal only.
- 2026-10-11: Queue snapshots of ready links; processing/failed rows remain for a
  later import. Receipts reuse destinations. Freeze queued collections against edits.
- 2026-10-11: New collections default to published with an explicit per-collection
  choice. Drafts stay account-private. Existing access roles and grants are unchanged.

## Outcomes & Retrospective

Collection-scoped review and durable import jobs are implemented. A focused API
test imports 105 ready links across two batches, preserves failed/processing rows,
and reuses the unpublished destination for a later import. Four production browser
journeys pass (112 assertions), including bookmarks, CSV, pagination, publication
choices and interrupted sign-in with and without JavaScript. The full isolated
verification gate passed, including all API suites, web tests, production build
and typechecks. The final layout rerun kept all four import journeys green; the
first-save publishing opt-out also passed separately with 42 assertions.

## Context And Orientation

`import-state.ts` derives readiness and collection summaries. `imports.service.ts`
authorizes mutations and batches. `email/worker.ts` hosts the job runner alongside
metadata/expiry work. `import-forms.ts` bridges native/enhanced commands and account-bound
sign-in replay. `import-review.tsx` renders repairs and collection import actions.

## Plan Of Work

Add draft publication and job fields using reviewed additive migrations. Expose
scoped reads, publication updates and queue/discard commands. Implement bounded,
serialized worker batches with resumable receipts. Replace file-level Review with
collection entries and scoped tables. Keep published choice outside row selection.
Update contracts, tests, product/design/decision documentation and support copy.

## Concrete Steps

Run `bun run check`, Prisma generation and disposable migration checks, focused
API/browser tests, then `bun run verify:isolated`. Preserve the running development
server and its draft data; only apply reviewed additive migrations.

## Validation And Acceptance

Two collection drafts can choose different publication states. Queueing one imports
all its ready links across pagination in bounded batches without affecting the other.
Failed/processing links remain reviewable; later jobs reuse the saved collection.
Jobs survive worker restart; unauthorized/stale commands fail. View collection
links expose completed results. Native forms preserve collection scope through
sign-in. Refresh is first; Import immediately precedes Clear selection; no redundant
selection count. Existing unpublished collections stay unpublished.

## Idempotence And Recovery

The authority lock serializes each batch. Savepoints roll back failures before the
job is marked failed under that same lock. Receipts prevent duplicate creation.
Migrations only add fields/change creation defaults; never reset user data.

## Artifacts And Notes

Both additive migrations were generated create-only against a disposable database,
reviewed and applied locally. Existing collection visibility is untouched.
Browser evidence: `/tmp/collection-import-browser2.log`; screenshots at
`/tmp/collection-review-{true,false}-{390,768,1280,1440}.png`.
Full gate log: `/tmp/collection-import-verify3.log` (passed).
Final import layout evidence: `/tmp/collection-import-browser3.log` (four import
journeys passed; the older capture expiry fixture failed). After allowing the
capture page's in-flight session activity to settle before forced expiry, its
focused rerun passed: `/tmp/capture-publication-browser.log`.

The sign-in return allowlist initially discarded the collection query parameter;
the browser replay test caught this and now passes with the collection retained.
Privacy fixtures now explicitly request unpublished collections, rather than
depending on the former creation default. Community membership is recorded in
ADR-0049 as future hub-scoped viewer access, separate from this milestone.

## Interfaces And Dependencies

Shared types expose collection summaries and job states, never Prisma types.
No runtime dependencies, access roles or entitlement model are added.
