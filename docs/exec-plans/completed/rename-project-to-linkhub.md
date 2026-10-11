# Rename the project to LinkHub under Hashikome

## Purpose / Big Picture

The repository, local checkout, application branding, package names, and local
Compose project should use LinkHub/linkhub. Shared product planning lives beside
it under Hashikome. Existing development data must remain available after the
move and rename. nsbox stays personal locally and on GitHub.

## Progress

- [x] (2026-10-11) Transfer GitHub repository and update its description.
- [x] (2026-10-11) Relocate checkout/workspace and repair shared planning links.
- [x] (2026-10-11) Refresh README and review onboarding drift; reproduce the
  existing pre-push hook's stale-pin failure.
- [x] (2026-10-11) Rename active packages, application/email branding, and Compose project.
- [x] (2026-10-11) Restart development against the original PostgreSQL volume;
  user, hub, collection and resource counts match before/after.
- [x] (2026-10-11) Full isolated verification passed; updated slogan email tests
  and format/docs checks passed.
- [x] (2026-10-11) Browser acceptance: 91 passed in the full run; the two
  failing journeys passed in focused reruns after the fixes documented below.
- [x] (2026-10-11) Isolated development startup/shutdown acceptance passed.
- [x] (2026-10-11) Prepare the reviewed implementation milestone; delivery uses
  a separate guide-only pin commit and the mandatory pre-push verification gate.

## Surprises & Discoveries

The pre-push hook is installed and executable but checks the guide pin rather
than updating it. Current guide examples had drifted from public collection
creation defaults and per-collection import jobs. Renaming the checkout changes
Compose's implicit project and volume names. Running dev processes also retain
old absolute build paths; those disposable caches can be cleared after stopping
the processes. Paul explicitly said no cache backup is needed.

The first full browser pass exposed a fixture timing race: discussion recovery
requested a new email code inside the real two-second resend window and received
`notice=limited&wait=1`. The fixture now waits through that window, matching
other existing recovery tests; production limiter behavior is unchanged.
The text-import fixture also still expected the retired flat review screen. It
now selects a collection draft and follows its destination after row assignment,
retaining hub-creation, invalid-row, discard and foreign-origin assertions.
That journey exposed a non-interactive confirmation toast intercepting links;
its pointer events now pass through to the page. Discard assertions follow the
current retained, closed draft model rather than expecting immediate deletion.

## Decision Log

- Decision: Public wordmark is lowercase `linkhub`; prose may use LinkHub.
  Rationale: Retain the existing lowercase wordmark convention while removing
  the ns prefix, as requested. Date/Author: 2026-10-11 / Paul and Codex.
- Decision: Keep the existing physical database and reuse its volume through
  local Compose configuration; no data reset or schema migration.
  Rationale: A project rename must preserve the user's development library.
  Date/Author: 2026-10-11 / Codex.
- Decision: Keep historical completed plans, prior ADR wording, and existing
  changelog entries as history. Update active authorities and current examples.
  Date/Author: 2026-10-11 / Codex.

- Decision: Use “Good links belong together.” as the product slogan. Remove
  company attribution from app/email footers; keep ownership in repository
  records and future policies/terms. Domain choice is pending Paul's lookup.
  Date/Author: 2026-10-11 / Paul and Codex.

## Outcomes & Retrospective

Implementation and local acceptance are complete. The public repository and
local checkout are under Hashikome, active branding/packages use LinkHub, and
the original development data remains intact. Source publication and its final
commit IDs are recorded in the shared migration task after the push gate passes.
The broader company platform, production deployment and final domain are separate
work. Paul has reopened final naming while exploring domains; LinkHub remains
the implemented working name until another is selected.

## Context And Orientation

`package.json`, workspace manifests, imports, TypeScript configuration, and
boundary tooling used `@nslinkhub/*` before this change. Web, email, Swagger,
TOTP issuer and passkey display names also carried the old name. `compose.yml` owns local
PostgreSQL/Redis. The existing database is `nslinkhub` on the physical volume
`nslinkhub_nslinkhub_pgdata`; changing those names is not necessary to rename the
project. The shared workspace is local and unversioned at `../workspace/`.

## Plan Of Work

Rename current source/package references together, regenerate the Bun lockfile,
and update copy and its existing assertions. Align current product ownership and
platform direction with Hashikome without implementing IAM or deployment. Give
Compose the explicit project name `linkhub`; local volume overrides attach the
existing storage as external, while clean installations create their own volume.
Review the guide against the completed commit and record that commit as its pin.

## Concrete Steps

From the repository root, run `bun install`, documentation checks, Compose
configuration inspection, `bun run verify:isolated`, and
`bun run verify:isolated test:browser`. Stop only identified project dev processes
before reinstalling or changing local Compose ownership. Remove old project's
containers without the volume-removal option, then start the new project using
its preserved volume. Inspect the mount and database before and after.

## Validation And Acceptance

- New package scope resolves throughout the source and build; full gate passes.
- Web, email and API metadata use linkhub/LinkHub and the product slogan;
  browser assertions pass and the local API/web preview responds.
- Compose resolves `linkhub`; the local PostgreSQL mounts the original volume
  and the same development records remain present.
- Shared backlog links and anchors resolve; nsbox's location and remote remain
  personal. The guide pin covers the final implementation commit.

## Idempotence And Recovery

Never reset/seed the database or remove its volume. Keep the local volume override
ignored by Git. Stop dev before regenerating package links; caches are disposable.
The old Compose project can be recreated against the same volume if required,
provided only one PostgreSQL container mounts it at a time. No deployment or
remote visibility change is part of this milestone.

## Artifacts And Notes

Prior Verify failure: guide pin `6da33eb` was stale against `ff78afe`.
Local source: `hashikome/linkhub`; origin: `git@github.com:hashikome/linkhub.git`.
The separate active ID-only collection-address plan remains unimplemented.

Acceptance evidence: `bun run verify:isolated` passed for the rename; email tests
passed (7 tests). The full browser run passed 91 of 93 tests, exposing two stale
fixtures. Discussion recovery then passed with and without JavaScript; the final
text-import rerun passed with and without JavaScript (14 assertions), including
row assignment, closed/discarded draft retention and foreign-origin rejection.
`bun run verify:isolated test:dev` passed startup, direct API/CORS, example links,
sign-in and shutdown. Documentation links, Biome formatting and diff checks passed.

## Interfaces And Dependencies

Preserve immutable IDs, API field names, database schema, session/auth origins,
passkey RP ID, secret inputs, product-owned authorization, and existing dependency
versions. Package scope and display branding change; company IAM stays planned.
