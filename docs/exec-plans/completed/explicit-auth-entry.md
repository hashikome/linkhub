# Separate sign-in and account creation

## Purpose / Big Picture

Give returning people Sign in and new people Create your account, in a centered,
email-first interface. Neither email nor Google sign-in may silently create an
account. A verified missing identity can explicitly create without repeating proof.
Capture and invitations retain their focused email-code workflows.

## Progress

- [x] (2026-10-10) Inspect current auth composition, consent, sealed flows and UI.
- [x] (2026-10-10) Backend creation consent and eight regression tests passed (91 assertions).
- [x] (2026-10-10) Shared centered entry, signup and verified creation screens; destinations preserved.
- [x] (2026-10-10) Removed superseded entry component/copy and updated ADRs/current docs.
- [x] (2026-10-10) Full gate passed: 310 tests, builds, typechecks, lint and boundaries; 12 browser journeys / 381 assertions passed, plus clean final auth/theme rerun.

## Surprises & Discoveries

Google already stages missing identities and requires explicit creation. Before this change, email OTP
created absent users unconditionally. Presentation-only signup pages
would leave that backend policy inconsistent. Existing tests intentionally creating
users must express creation consent instead of relying on implicit signup.

## Decision Log

- 2026-10-10: Two entry pages share auth implementation. Email-first primary action,
  secondary Google; passkeys/factors remain subsequent steps.
- 2026-10-10: Check account absence only after proof. Bind short-lived email creation
  proof to the browser and consume it atomically. Both ordinary entries finish with explicit Create account; signup intent controls
  wording, not backend identity authority. Capture keeps direct creation consent.
- 2026-10-10: Preserve same-email Google rules, recovery, invitation isolation,
  capture consent, app-owned onboarding and immutable identity boundaries.

- 2026-10-10: User added optional named hub at signup. Offer it on shared verified
  creation, off by default; allocate username/handle together and create atomically.
- 2026-10-10: User reaffirmed exact approved heading/layout and missing-account
  choices. Removed additional entry marketing copy.

- 2026-10-10: Restore signed-out appearance choice with System default and a
  separate temporary reader preference; preserve saved signed-in preferences. Demo and reader share copying from first render; demo URLs select an
  item on the landing page instead of referencing fictional collections.

- 2026-10-10: Remove the redundant OAuth completion screen. Ordinary completion
  redirects immediately; interrupted writes auto-submit the existing checked POST,
  with a native fallback only when JavaScript is unavailable.

## Outcomes & Retrospective

Completed the approved separate-entry workflow, verified creation consent and
optional hub onboarding. Removed the obsolete sign-in options component and the
OAuth completion screen. Restored anonymous theme controls with a separate reader
choice, preserving saved account preferences. Unified demo/reader item copying.
No migrations or live-user data changes were needed.

The full `bun run verify` gate exited 0 with 310 passing tests and all builds,
typechecks, lint, format, document and boundary checks
(`/tmp/nslinkhub-registration-verify-final.log`). The broader browser test process
reported 12 passing journeys before its wrapper received SIGTERM during cleanup;
a focused final rerun of Google return and appearance exited 0 with 3 passing
journeys / 90 assertions (`/tmp/nslinkhub-auth-return-final.log`). No persistent
development servers were started; owned test listeners were shut down.

Pinned Better Auth consumption order matters to verified email creation: its
sign-in OTP primitive consumes valid proof before the disabled-signup branch.
The scoped adapter observation distinguishes that branch from incorrect proof;
expiry, wrong-code, replay, cancellation, race and rollback tests cover the boundary.

## Context And Orientation

API auth lives in apps/api/src/auth: delivery-auth owns codes and transactions;
security-handler/plugins own Google, factors and session policy. The Next web is a
form/SSR delivery surface, with sealed SignInFlow and safeReturn destinations.
Current unified entry routes live under apps/web/src/app/sign-in. No schema change
is needed: Better Auth verification records store short-lived staged proof.

## Plan Of Work

Establish explicit creation in the API first, retaining Better Auth verification
and session primitives. Add pending email registration preview/confirmation with
expiry, cancellation, replay and concurrent-registration protection. Wire signup
intent through web flows and consolidate creation presentation for email/Google.
Build the centered shared auth layout, remove obsolete entry copy and unused
controls. Reconcile ADRs and current designs, then verify all affected workflows.

## Concrete Steps

Use isolated checkouts for builds and test databases. Run bun run verify and
focused bun run test:browser journeys; inspect light/dark screenshots at 390, 768,
1280 and 1440 widths. Do not start persistent development servers.

## Validation And Acceptance

Sign-in with an unknown email proves the inbox but creates no user/session before
consent. Signup creates after proof; existing accounts authenticate and retain
factors. Google retains explicit email-specific creation consent. Switching entry
or email preserves destination. Capture/invitations remain email-only. Pending
proof cannot be forged, replayed, reused after expiry or used to take over a racing
account. Layout has email first, stable form alignment, visible labels, accessible
states and no image dependency. Both JS and native forms work.

## Idempotence And Recovery

Preserve existing user changes. Tests use disposable databases, synthetic mail and
owned dynamic listeners. No migrations or development-data resets. Close owned
processes at completion; failed proof consumes attempts while server faults roll back.

## Artifacts And Notes

Focused production-browser verification passed 12 journeys / 381 assertions in
`/tmp/nslinkhub-registration-browser-latest.log`, including native forms, same-email
Google return without a completion click, deliberate creation with/without a hub,
TOTP recovery, capture recovery, destination preservation, demo and collection item
copying, and separate anonymous/account theme preferences. Google consent/token
responses are synthetic; the real backend callback, state cookies and local
session flow are exercised. Provider-console acceptance is not claimed.

Visual review used `/tmp/explicit-auth-sign-in-dark-390.png`,
`/tmp/explicit-auth-sign-in-light-768.png`,
`/tmp/explicit-auth-sign-up-light-1280.png`,
`/tmp/explicit-auth-sign-in-dark-1440.png`,
`/tmp/explicit-auth-create-true-true.png` and `/tmp/explicit-auth-error.png`.
Both entry pages were rendered in light/dark at all four widths. Checked empty,
filled, error, focus, disabled/native fallback and long-email states. The narrow
form and primary email action make the next step clear; verified-email creation
consent removes the accidental-account ambiguity.

Refactoring UI review: “You don't have to fill the whole screen”, “Semantics are
secondary” and the taste-layer state/copy review. Fixed the initial shortened
heading, hub-field width, inaccessible anonymous appearance and changing item-copy
label. Final heuristic scores (0–4): status 3, real-world match 4, control 4,
consistency 4, error prevention 4, recognition 3, efficiency 3, minimalism 4,
error recovery 3, help 2: **34/40**. Remaining deliberate constraints: passkeys
require JavaScript; native browsers use a visible action to resume an interrupted
write, while ordinary OAuth navigation redirects immediately. No decorative image
or additional entry choices were introduced.

## Interfaces And Dependencies

Backend owns proof/account decisions. Better Auth remains responsible for OTP
checks, credentials and sessions. Web stores presentation intent and validated
return destinations only; it never creates users or decides email ownership.


## Reader appearance refinement (2026-10-10)

Following the user's final clarification, signed-out readers initially follow the
OS but see only a sun/moon toggle between Light and Dark. CSS selects the correct
icon and action before hydration, including without JavaScript. Signed-in users
retain explicit Light/Dark/System choices. Reader choices use a separate browser
session cookie and never overwrite the saved signed-in preference.

The production build and theme journeys passed (2 journeys, 75 assertions;
`/tmp/nslinkhub-theme-toggle-final.log`); final reader/demo checks passed again
(2 journeys, 41 assertions; `/tmp/nslinkhub-reader-final.log`). Web unit tests passed
24 tests / 157 assertions; formatting, lint, docs and web/client boundaries passed.
These targeted checks followed the complete 310-test gate above. Screenshot review
at 390, 768, 1280 and 1440 used `/tmp/reader-theme-{true,false}-{width}.png` and
caught adjacent native fallback text; added spacing and rechecked. The layout
assertion now compares document coordinates so native keyboard-focus scrolling is
not mistaken for the headline moving when the example collapses. Test listeners
were closed after verification.
