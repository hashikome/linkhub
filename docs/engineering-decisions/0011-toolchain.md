# ADR-0011: Toolchain: Bun, Biome, reviewed Prisma migrations

**Status:** accepted  
**Date:** 2026-10-07

## Context

One fast toolchain across the monorepo, with migrations that never silently
drop hand-written SQL.

## Options considered

- npm/pnpm, ESLint/Prettier, auto-applied migrations
- Bun, Biome, create-only reviewed migrations

## Decision

Bun installs, runs and tests; Biome formats and lints (`useImportType` off in the
API for NestJS DI). Schema changes use `prisma migrate dev --create-only` and are
reviewed so `app_uuid_v7()`, triggers, CHECKs and partial indexes survive.
`bun run verify` and the browser suite gate every milestone. The full-browser
frequency is superseded by [ADR-0062](0062-focused-release-browser-gate.md); the
toolchain and migration rules remain binding.

## Rationale

- Fewer tools, faster feedback, safe migrations.

## Constraints to preserve

- No npm/Yarn/pnpm lockfiles; no ESLint/Prettier.
- Never apply an unreviewed migration diff.

## Links

- [migrations.md](../runbooks/migrations.md)
- [verification.md](../runbooks/verification.md)
