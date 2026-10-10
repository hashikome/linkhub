# Persist account timezone and render dates consistently

## Purpose / Big Picture

A signed-in person chooses Automatic (device timezone) or an IANA timezone in
Settings. The preference belongs to the database User, follows the account across
devices, and controls date/time rendering and calendar-day filters. Explicit
choices render correctly on the server. Guests and Automatic use the device after
hydration, with labelled UTC when JavaScript is disabled.

## Progress

- [x] (2026-10-10) Inspect profile persistence, shared timestamps and audit filters.
- [x] (2026-10-10) Add nullable User.timeZone, backend validation and private profile contracts.
- [x] (2026-10-10) Add Settings selector and shared timezone provider; align date filters.
- [x] (2026-10-10) Verify migration, API ownership/validation, browser behavior and full gate.
- [x] (2026-10-10) Update authoritative docs and changelog; complete this plan.

## Context And Orientation

`apps/api/prisma/schema.prisma` owns User; `modules/users` exposes authenticated
GET/PATCH profile. Public person projections are explicit and exclude preferences.
`apps/web/src/components/profile-editor.tsx` autosaves ordinary fields through
native forms or enhancement. `local-time.tsx` formats shared timestamps;
`audit-dates.tsx` converts calendar filters. Layout already reads the own profile.

## Plan Of Work

Add an additive nullable `time_zone` column and private wire property. Validate
supported IANA names in the API, with null meaning Automatic. Add a labelled native
select to Profile settings and include it in existing autosave reconciliation.
Pass the saved preference from Layout into a client context that also works during
SSR; update it only after successful saves. Use the context for exact/relative dates
and audit calendar boundaries. Keep UTC instants in persistence unchanged.

## Concrete Steps

Generate a reviewed migration with `bunx prisma migrate dev --create-only` from
apps/api against a disposable migrated database. Apply with migrate deploy locally,
regenerate Prisma and verify schema parity. Run API people/wire-contract tests,
web tests and browser journeys, then `bun run verify` in an isolated checkout copy
to avoid interfering with the user's running development build.

## Validation And Acceptance

- New/existing users default to null; valid zones persist; null resets Automatic.
- Invalid values fail without mutation; another account cannot change this user;
  preferences never appear on public profiles.
- Explicit zones appear correctly before hydration and without JavaScript.
- Automatic follows device; saved zone overrides a different device; guests ignore
  account preferences; resetting/switching preference updates visible timestamps.
- Check midnight, DST and fractional-offset rendering/filter boundaries.
- Settings remains accessible and usable on phone/desktop, light/dark, native/JS.
- Owned test listeners close; existing development processes remain untouched.

## Idempotence And Recovery

The migration adds a nullable column only; no timestamp rewrites or data backfills.
Migrate deploy is repeatable. Disposable databases and test servers are cleaned up
by harnesses. Never reset the user's development database. A rollback can leave the
nullable column while reverting application consumers.

## Decision Log

- 2026-10-10: Store a private nullable IANA timeZone on User, not in a browser cookie.
  User explicitly requested database persistence; null retains Automatic across devices.
- 2026-10-10: Keep timezone conversion a display concern; UTC instants, authorization
  and scheduling behavior are unchanged. The API validates saved preferences.

## Surprises & Discoveries

- Audit calendar filters currently use the device timezone directly. They must
  follow the preference as well or their selected days would disagree with rows.
- Local schema parity reports a pre-existing username column width mismatch.
  The generated migration on a fresh migrated database contains only ADD COLUMN
  time_zone VARCHAR(100); no unrelated schema changes were applied.
- Native audit forms cannot refresh hidden timestamp inputs after a date edit.
  Their submitted calendar dates are converted with the saved timezone on the
  server; enhanced Automatic forms supply device-local boundaries.
- IANA aliases are accepted without requiring a particular canonical spelling:
  supported Intl runtimes can preserve aliases differently.
- Native fallback timestamps must place the semantic time element inside
  noscript, avoiding both empty native output and duplicate time elements.
- The dev-loop assertion still expected the demo's retired resource-navigation
  action. It now verifies copy buttons and native links back to the demo item.

## Outcomes & Retrospective

Implementation and verification are complete. The preference is persisted on
User, private to the account, and applied consistently across devices and native
or enhanced reading/filtering. The demo uses the fixed fictional instant 2026-10-08T10:00:00Z,
so its relative age advances instead of resetting on each page load.

## Artifacts And Notes

- `bun run verify`: passed in an isolated working copy, including API build,
  unit/e2e tests, web tests, production build and typecheck.
- `bun run test:browser --test-name-pattern 'persists account timezone|filters audit calendar days|shows recorded audit effects|edits the own profile|lets visitors explore the collection example'`:
  five journeys passed, 132 assertions. Includes native/JS saves, Automatic reset,
  server rendering, guest isolation, another device and native/enhanced DST filters.
- `bun run test:dev`: passed, including owned server shutdown.
- Fresh migration-chain/schema parity: no difference detected. Local development
  migration applied without modifying the unrelated username column drift.
- Date tests cover DST days, midnight jumps, fractional offsets and year boundaries.
- Settings screenshots inspected at 390, 768, 1280 and 1440 pixels in light/dark;
  existing visual hierarchy preserved and no horizontal overflow.
- Owned browser/dev test listeners closed; the user's development stack was untouched.

## Interfaces And Dependencies

Private Profile gains `timeZone: string | null`; UpdateProfileRequest accepts an
optional nullable timeZone. Runtime Intl supplies IANA validation/formatting.
React context distributes a server-provided account preference, never API internals.
