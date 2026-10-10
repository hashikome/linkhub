# Shorten usernames with optional suggestions

## Purpose / Big Picture

Store usernames of 3–20 characters. For an otherwise valid longer draft, offer a
readable prefix and four lowercase letters/digits derived from a hash of its
omitted text. The user explicitly accepts the suggestion; merely checking it
never renames an account. Case normalization, hyphen-insensitive uniqueness,
numbers and reserved names continue to follow ADR-0026.

## Progress

- [x] (2026-10-09) Inspected current contracts and user preferences. The proposed
  32-character limit was interrupted before edits; 20 supersedes it.
- [x] (2026-10-09) Implemented backend limits, bounded deterministic suggestions and onboarding.
- [x] (2026-10-09) Updated persistence, UI, policy docs and boundary/collision tests.
- [x] (2026-10-09) Verified migration parity, full gate, four focused browser journeys and desktop/mobile screenshots.

## Surprises & Discoveries

Username format currently aliases the 60-character hub-handle validator. They
need independent limits. The original migration's random fallback is 39
characters; reducing the column alone would break populated migrations.

## Decision Log

- User / 2026-10-09: maximum 20, hash-derived suggestion, four letters/digits.
- Suggestions use at most 15 prefix characters, a hyphen and four base-36
  characters. Trim the prefix's trailing hyphen. Check each candidate through
  backend normalized availability, with a bounded deterministic retry sequence.
- Keep the person's typed value until explicit acceptance. Enhanced forms can
  retain up to 255 input characters to request suggestions; native forms retain
  the 20-character constraint and ordinary manual editing/saving.
- Correct the existing uncommitted predeployment migration; no development DB
  reset or backwards-compatibility exceptions. Hub limits remain separate.

## Outcomes & Retrospective

Complete: the API and database enforce 3–20-character usernames. Overlong valid
drafts receive deterministic, availability-checked candidates with four base-36
suffix characters. The UI retains the original draft until explicit acceptance,
rechecks a stale/taken suggestion and ignores responses for older drafts. Native
forms save exact 20-character names. Onboarding and populated migration backfills
fit the new bound, including suffix collisions. No development database reset,
commit or unrelated work was discarded. No remaining work is deferred.

`bun run verify` passed (`/tmp/username-verify.log`). Focused production browser
checks passed: 4 tests, 79 assertions, 0 failures, 56 tests filtered out
(`/tmp/username-browser.log`). They cover profile availability/error handling,
public profiles, exact-boundary native/JS saving, suggestion acceptance, competing
claims, stale responses and lookup failure. Desktop/mobile screenshots were
inspected at `/tmp/username-suggestion-desktop.png` and
`/tmp/username-suggestion-mobile.png`; layout fits without horizontal overflow.

## Context And Orientation

The API users module owns usernames, availability and onboarding. Shared types
expose UsernameAvailability. The web ProfileEditor currently autosaves valid
inputs and checks availability through HTTP. Prisma's users.username is VARCHAR60,
with SQL format/reserved checks and a hyphen-insensitive unique expression index.
The working tree contains completed uncommitted work that must be preserved.

## Plan Of Work

Give username rules their own 20-character maximum. Add a backend-only candidate
generator and checked suggestion lookup, extending availability with an optional
suggestion. Bound onboarding names and collision suffixes. Update column/checks
and backfill defaults. Let enhanced settings request suggestions for long drafts
and apply one via an explicit button. Update ADR-0026 with an amendment, focused
design/product docs and changelog. Add meaningful length, deterministic collision,
non-mutation and browser acceptance/race regressions.

## Concrete Steps

Use `bun run verify`, then `bun run test:browser --test-name-pattern` for profile
and suggestion journeys. Review Prisma migration generation in a disposable copy
with `bunx prisma migrate dev --create-only`; verify the final corrected chain
against empty and populated disposable databases and `prisma migrate diff`.

## Validation And Acceptance

20-character names save, 21-character names cannot persist, and 60-character hub
handles remain valid. Case and hyphen variants remain unavailable. Repeated long
input yields the same candidate while availability is unchanged; occupied or
reserved candidates are skipped and no suggestion claims a name. Malformed input
gets no suggestion. Long onboarding names and suffix collisions fit the limit.
The UI retains long drafts, ignores stale responses and saves only an accepted
suggestion; unavailable service responses leave manual editing possible. Native
forms can save valid names. No client computes a hash or authoritative suggestion.

## Idempotence And Recovery

No commits, resets or overwritten prior work. Verification databases are random,
owned and disposable. Editing the uncommitted migration means existing development
copies require the previously planned preproduction reset; this task does not run it.

## Artifacts And Notes

Prisma create-only review against the previous schema generated only the expected
VARCHAR20 alteration (`/tmp/username-schema-review.log`, generated SQL at
`/tmp/username-generated-migration.sql`). The final correction instead updates the
uncommitted creation/backfill migration, avoiding truncation of existing data.
Populated fixture migration checks passed (`/tmp/username-schema.log`): exact
20-character adoption, overlong handle fallback, SQL length rejection, retained
functions/triggers/constraints/indexes and no Prisma drift. Focused unit checks
passed (9 tests, 40 assertions). Prior review fixes are recorded
in `fix-identity-and-sharing-continuation.md` in completed plans.

## Interfaces And Dependencies

Extend only UsernameAvailability with optional suggestion. No new dependencies.
Node crypto stays in the API; clients never import API modules or Prisma types.
Suggestions convey availability at check time, not a reservation. Saving rechecks
under the existing authority transaction and SQL unique index.
