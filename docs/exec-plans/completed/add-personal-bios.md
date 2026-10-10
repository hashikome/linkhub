# Add independent personal bios

This ExecPlan is maintained according to `PLANS.md`.

## Purpose / Big Picture

People can describe themselves on their public profile without creating a hub.
Profile settings edits a personal bio independently of the hub description.

## Progress

- [x] Inspect profile persistence, API contracts, settings and public rendering.
- [x] Add nullable bio persistence and validate authenticated edits.
- [x] Add settings editing and public plain-text rendering.
- [x] Verify API, native forms, autosave and responsive presentation; update docs.

## Surprises & Discoveries

None yet.

## Decision Log

- 2026-10-08: Bio is optional public plain text, limited to 500 characters.
  Store it on User; blank input clears it to null. Hub ownership visibility does
  not control personal bio visibility. This follows the separate-person model.

## Outcomes & Retrospective

Completed. Personal bios persist independently of hubs and display safely on
public profiles. Full verification and all 47 browser journeys pass. The
settings and public-profile mobile screenshots were visually inspected.

## Context And Orientation

User settings use UsersService and Profile; anonymous profiles use
PeopleController and PersonProfile. ProfileEditor supports autosave and native
forms through /forms/profile-save. The existing hub description stays separate.

## Plan Of Work

Add an additive migration and API validation first, wire shared types and both
form paths, render escaped text with preserved line breaks, then verify behavior.

## Concrete Steps

Generate a migration with Prisma migrate dev --create-only against a disposable
database. Review SQL, deploy locally and regenerate the client. Run `bun run
verify` and `bun run test:browser` in the isolated verification checkout.

## Validation And Acceptance

A hubless person can save, read and clear a bio with or without JavaScript.
Anonymous readers see the bio, never email. Empty bios render no block; markup
stays text. Omitted bio updates preserve it. Invalid or overlong values fail.
Editing a bio does not create a hub or change a hub description.

## Idempotence And Recovery

The migration only adds a nullable column. Tests use disposable databases.
Preserve existing working-tree changes and do not rewrite applied migrations.

## Artifacts And Notes

The reviewed migration 20261008163857_personal_bio only adds users.bio VARCHAR(500).
It is applied locally; Prisma reports no schema drift. Full verification passed
(log: /tmp/nslinkhub-bio-verify.log). Browser verification passed: 47 tests, 607 assertions
(log: /tmp/nslinkhub-bio-browser.log). The hubless-profile journey verifies saving
and clearing bios with and without JavaScript, text escaping, line breaks and
no implicit hub creation. Screenshots: /tmp/people-settings-hubless-true.png and
/tmp/people-profile-hubless-true.png.

## Interfaces And Dependencies

User.bio and Profile.bio are nullable strings. UpdateProfileRequest.bio is an
optional string; PersonProfile.person.bio is nullable. No new dependency.
