# Unify collection management

## Purpose / Big Picture

One Collections table replaces My hub / Service. Search accepts a collection ID
or link; backend-provided actions reflect ownership, contribution and service
moderation independently. The reader toolbar gains Share, including for readers.

## Progress

- [x] (2026-10-09) Read existing policy, management surfaces and owner mutation APIs.
- [x] (2026-10-09) Added unified paginated discovery and capability projection; private-title and role regressions pass.
- [x] (2026-10-09) Added direct action menu, owner action forms and reader Share control.
- [x] Verify privacy, mutations, pagination and JavaScript/no-JavaScript journeys.

## Surprises & Discoveries

Publish, delete, direct sharing, link sharing and transfer already exist in the
API, but the web exposed only edit. Holds never authorize private-content reads.

## Decision Log

- 2026-10-09: Latest user steering replaces selector/Run with direct action links. Keep the secondary Action trigger identical during hydration; portal the modal outside table styles.

- 2026-10-09: Combine owned/shared collections with publicly readable collections
  and existing holds for operators. Private held rows expose moderation metadata
  only. Search never grants access and ignores pasted token query parameters.
- 2026-10-09: Reuse the existing policy and mutation endpoints. A reader shares a
  URL; only the owner can change access. Only operators hold/release distribution.

## Outcomes & Retrospective

Completed and verified on 2026-10-09. Full `bun run verify` passed, followed by
52 production browser tests (798 assertions), including JavaScript-free forms,
permission boundaries, ID copying, direct account navigation and collection actions.
Reviewed the final account profile screenshot: Member since, Account updated,
Last login, and permitted actions at the bottom. Local schema parity reports
“No difference detected”. No real user account or collection was deleted.


## Context And Orientation

CollectionsService and CollectionPolicyService own content authorization.
OperationsService owns cookie-only, recently verified moderation. The new
management projection combines those authorities without changing either.

## Plan Of Work

Add a bounded backend list and action contract; replace the split list with one
searchable table and native Action menu. Reuse existing forms and add owner
forms for the existing API operations. Add a progressive Share control. Accounts opens detail directly; Collections keeps direct action menus.

## Concrete Steps

Run `bun run verify` and `bun run test:browser` in the isolated scratch checkout;
inspect desktop/mobile screenshots. Update docs, decisions and changelog.

## Validation And Acceptance

Foreign private titles never leak. Forged actions fail at the API. Search by ID
and permalink works with pagination scoped to viewer/search. Owner actions and
moderation retain their separate authority and destructive confirmations. Share
works for readers without implicitly changing collection access.

## Idempotence And Recovery

No schema changes for collections; tests use disposable data. Mutation endpoints
remain authoritative. Never execute deletion against real user content.

## Artifacts And Notes

Evidence to be recorded after verification.

## Interfaces And Dependencies

Shared types contain no Prisma internals. Reuse Bun, Next native forms, Nest,
Prisma, authority transactions and existing collection policy; no new dependency.

Verification checkpoint (2026-10-09): full `bun run verify` passed in the isolated
checkout (`/tmp/nslinkhub-final-profile-verify.log`), including the Last login
transaction regression and bounded profile API. Local migration parity reports
“No difference detected”. Final browser verification passed: 52 tests, 798 assertions.

Final evidence: `/tmp/nslinkhub-final-profile-verify.log`,
`/tmp/nslinkhub-final-profile-browser.log`, `/tmp/account-profile-true.png`,
`/tmp/account-profile-false.png`, `/tmp/manage-action-dialog.png` and
`/tmp/manage-action-dialog-mobile.png`. Earlier attempts exposed a stale
last-login exclusion assertion and an intermittent unrelated capture journey;
the final complete runs pass with the updated contracts.
