# Preserve capture replay and interrupted import edits

This ExecPlan follows `PLANS.md`.

## Purpose / Big Picture

Retrying a saved capture must survive target slug/handle changes. Valid import edits
must survive expired-session sign-in even when their encrypted body exceeds cookie
limits. Replays remain account-bound and subject to current API authorization.

## Progress

- [x] (2026-10-11) Confirmed alias-based receipt reconstruction and unbounded recovery cookies.
- [x] Persist immutable resource IDs; 12 focused API tests passed, including alias changes, deletion, legacy receipts, and recovery storage.
- [x] Add bounded, encrypted, expiring backend recovery storage; three codec tests passed.
- [x] (2026-10-11) Full isolated verification and final browser recovery regression passed; documented results.

## Surprises & Discoveries

The first browser build caught additional native-form cookie call sites that needed
awaiting after persistence became asynchronous; corrected all sites. A concurrent
full gate hit the existing 5-second verification-environment test timeout. Rerun
browser and full verification sequentially to avoid build contention.

Capture receipts currently retain only a destination and request fingerprint. Existing
receipts cannot reconstruct a renamed alias reliably. Pending actions use a single
cookie with no write-side size check; the reader rejects values above 4,000 characters.

## Decision Log

Store resource IDs on new receipts; preserve the existing lookup only for legacy
receipts, then upgrade them when resolution succeeds. Never return replacement rows
when a saved ID has been deleted. Store oversized sealed pending actions in the API
with an opaque random reference, 15-minute expiry, bounded size, signed web-server
requests, and periodic pruning. No browser storage, plaintext action persistence,
or process-local state. Small cookies remain compatible. Storage failure must be
visible and must not redirect as if preservation succeeded.

## Outcomes & Retrospective

Implementation and verification complete. The migration applied
successfully to a disposable database and local development. Schema parity reports
"No difference detected." Focused API tests: 12 passed / 70 assertions. Codec
tests: 3 passed / 13 assertions. The full `bun run verify:isolated` gate passed,
including database-backed API tests, 33 web tests, production build, typechecks,
format/lint, boundaries, tooling and documentation checks. The final
`bun run verify:isolated test:browser --test-name-pattern 'resumes submitted import corrections'`
passed with and without JavaScript (18 assertions), including exact field recovery
and temporary payload cleanup after replay. Changes remain uncommitted.

## Context And Orientation

`capture.service.ts` owns capture idempotency; `CaptureReceipt` in Prisma records it.
`apps/web/src/lib/pending-action.ts` encrypts and reads interrupted actions;
`import-forms.ts` and `complete-sign-in.ts` preserve and replay them. The API owns
persistence; the web must not import Prisma or connect directly to its database.

## Plan Of Work

Add receipt resource IDs and temporary recovery storage through a reviewed additive
migration generated against a disposable database. Add a signed service endpoint
for opaque payload storage/read/delete. Retain encryption and account fingerprint
validation in the web adapter. Cover large UTF-8 edits, tampering/expiry, unauthorized
storage access, replay after alias changes, and deletion of saved resources.

## Concrete Steps

Use Bun and the disposable database helper for migration generation and focused API
tests. Run `bun run web:test`, typechecks and `bun run verify:isolated`. Record any
environment limitation explicitly rather than claiming unrun tests passed.

## Validation And Acceptance

Identical capture requests return the original IDs after slug/handle changes;
removed resources still fail. Large valid import edits round-trip exactly with
cookies below browser limits. Wrong-account replay remains blocked. Recovery data
expires and unsigned storage requests fail. Existing small-cookie recovery works.

## Idempotence And Recovery

Additive migration preserves old receipts and existing content. Recovery reference
writes are retry-safe and reads do not consume the action before sign-in completes.
Replay uses the original command/version; no new content authority is conferred.

## Artifacts And Notes

Focused logs: `/tmp/recovery-focused.log`, `/tmp/recovery-parity.log`,
`/tmp/recovery-browser3.log`. Final gate: `/tmp/recovery-verify3.log`.

No deployment or repository commit is part of this patch.

## Interfaces And Dependencies

Reuse `WEB_SOURCE_SECRET` with separate cryptographic domains for service proofs and
action encryption. PostgreSQL provides shared storage across web replicas; scheduled
API maintenance prunes expired encrypted records.
