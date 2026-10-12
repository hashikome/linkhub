# ADR-0062: Focus the release browser gate

Status: Accepted
Date: 2026-10-12

## Context

The first push-to-deploy run repeated the entire browser suite before image
rehearsal and publication. The owner selected faster iteration with explicit
critical journeys on releases and deliberate broader browser verification.

## Options considered

- Run every browser regression on every push: broad coverage, slow feedback.
- Remove browser coverage from releases: faster, but misses actual form/navigation failures.
- Keep a small critical set and dispatch the full suite when warranted: selected.

## Decision

Keep `bun run verify` in both the local pre-push hook and GitHub verification.
GitHub additionally runs `bun run test:browser:critical`, selecting four existing
`[critical]` journeys: public collection reading/navigation, real email sign-in
and session isolation, invitation acceptance with fresh email proof, and first
private-link capture. They retain their existing JavaScript/native-form coverage.

The separate `Full browser verification` workflow runs only by manual dispatch on
the selected ref. It uses disposable PostgreSQL/Redis and captured email, produces
failure diagnostics, and never deploys. Local full and focused commands remain
available. Broad UI/auth changes warrant deliberate full-suite acceptance; routine
pushes do not automatically invoke it.

This partially supersedes ADR-0011's full-browser gate for every milestone.
Its Bun/Biome and reviewed-migration rules remain unchanged. Image rehearsals,
immutable GHCR publication, migration-before-serve and live readiness gates remain
required by the release coordinator.

## Consequences and constraints

The focused gate does not claim exhaustive UI coverage. Keep each critical tag
tied to a named user journey and review growth deliberately. Local hooks are not
a replacement for required GitHub verification. Browser fixtures must never use
production credentials, real mail or the developer's working database.

See [verification](../runbooks/verification.md) and
[release preparation](../runbooks/release.md).
