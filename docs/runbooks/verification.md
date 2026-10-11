# Verification

The canonical verification gate:

```bash
bun run verify
```

When a development server is running in this checkout, use:

```bash
bun run verify:isolated
bun run verify:isolated test:browser
```

This snapshots tracked and non-ignored untracked regular files (including current
edits, staged and unstaged deletions, and renames) into a disposable checkout, installs the frozen lockfile,
and runs the same gate with independent generated clients and Next.js output.
Environment files are excluded; test runners retain their disposable database,
queue and secret masking rules. It removes its temporary checkout afterward.
Do not build into an active development server's `.next` or remove its lock.
The wrapper also accepts `test:dev` and passes remaining arguments to the runner.

It runs client/telemetry boundary checks, local documentation links, the
guide-pin check, shared typechecks, Biome format/lint, tooling/email tests,
then API generation/build, typecheck, source unit tests and real-service e2e,
plus web boundary checks, HTTP tests, production compilation and typechecking.
Test discovery names source files explicitly and excludes generated/compiled
copies. `check:docs` checks local inline/reference links and heading anchors
in current Markdown documents; completed plans are historical snapshots and
are excluded. External links are not fetched.

The e2e stage first runs `tooling/verify-test-isolation.ts`: a sentinel database
is created before four concurrent child processes prove distinct databases,
success/failure/SIGTERM cleanup, and preservation of a surviving run and the
sentinel. Only these owned fixtures are asserted; unrelated concurrent runs
may clean up their own databases during the check. Production
and non-loopback admin configuration are refused. No required service check
silently skips when PostgreSQL is missing.

`tooling/verify-api-tests.ts` then uses `tooling/test-database.ts` to create a
fresh random PostgreSQL database, apply every migration, run suites serially,
and drop only that database. It clears request budgets inside the disposable
DB between suites. On interruption, setup must settle before cleanup decides
ownership, and any running suite is terminated before dropping the DB. SIGKILL
or host failure can still leave a `test_*` database; inspect ownership/running
processes before manually removing an abandoned one.

Defaults use the local +4 ports. Override only through test-specific
`TEST_DATABASE_ADMIN_URL` (a loopback PostgreSQL role with CREATEDB) and
`TEST_REDIS_URL`. Development `DATABASE_URL` and `_FILE` inputs never select
the test database. Email tests use a random per-run queue namespace and remove only their own
queue keys. Tests force the capture provider regardless of local Resend settings.
Remote telemetry is disabled by the runner; SDK tests use a local listener.

API, browser and dev-loop runners use `tooling/verification-env.ts` to mask
secret-file overrides, remote-delivery credentials and telemetry/proxy settings
with explicit inherited empty strings (and a synthetic valid release SHA).
Never delete these variables: Bun or dotenv can reload absent values from
API-local `.env` files in a child or grandchild. The mask travels with migration,
API, worker and web environments; the owned database URL remains explicit.
`bun run tooling:test` exercises conflicting env files in a temporary workspace,
including real Prisma/worker configuration resolution and nested Bun/Node
spawns, without connecting to the conflicting database.

Shared TypeScript configuration rejects unused locals and parameters.
Formatting and linting are Biome (`biome.json`). `useImportType` is disabled
for `apps/api` only (via a Biome override) because NestJS dependency injection
and `emitDecoratorMetadata` need runtime imports for decorated
classes/parameters; it stays enabled for `packages/*`, `tooling/`, and
`apps/web`. Autofix everything with `bun run check` (adds
`biome check --write`).

Requirements: `bun run infra:up` (PostgreSQL + Redis) for the e2e stage.
For shared reader/preview changes, also run `bun run test:dev`: it checks the
development-rendered example for fictional record links, in addition to the
production browser journey.

## Local Enforcement

A versioned `pre-push` hook in `tooling/git-hooks/` runs `bun run verify`
before every push. It checks the onboarding pin but never updates it: review
the guide and make a guide-only pin commit after the source changes it covers.
The repository is now public under Hashikome; no remote ruleset was configured
as part of the transfer. The local hook remains the configured blocking gate.
`bun install` wires it through the root `prepare` script
(`tooling/setup-git-hooks.ts` sets `core.hooksPath`; it no-ops without a
`.git` entry, so deployment image builds are unaffected). Deletion-only
pushes skip verification. Because the e2e stage needs the local services,
push with `bun run infra:up` done — or bypass an emergency push with
`git push --no-verify` or `SKIP_VERIFY=1` (generic name by the
no-branding-in-env-vars rule).

Keep the hook fast enough that nobody is tempted to bypass it by habit.
If gate duration becomes impractical, split the tiers: keep a fast command (format,
lint, typechecks, unit tests, static checks) as the pre-push gate and move
the full suite to hosted CI as the authoritative gate — enforced
server-side through required status checks when remote enforcement is configured.
This escalation path is the decided design; only its trigger is pending.

## Expectations

- Every phase/milestone ends green on `bun run verify` before it is
  committed.
- E2E does not require resetting development data. On failure inspect the
  failing suite and service connectivity; the next run gets a fresh database.
- `.github/workflows/verify.yml` runs this full gate on pushes and pull
  requests with required PostgreSQL and Redis services. Missing infrastructure
  is a failure, never a skipped green suite. It also installs Chromium and runs
  `bun run test:browser` for the complete reading journey. Application compilation remains
  part of verification; Docker image builds and rehearsals are separate.
- `.github/workflows/release.yml` is manually dispatched for deployment
  preparation. It requires the full gate, then builds and rehearses an image
  before the publication job can run. Image acceptance is separate from local application
  development. See [release preparation](release.md) for evidence and live gates.
- `bun run verify:release-image -- <image>` runs that additional Docker release
  check locally when preparing deployment artifacts. The completed
  [auth-delivery plan](../exec-plans/completed/prove-auth-delivery-boundary.md)
  records source verification and the fresh image check deferred to deployment.
- New behavior with route-shape or authorization consequences gets an e2e
  regression test (`test/routes.e2e.spec.ts` is the pattern: it exists
  because two shadowed routes shipped unnoticed).

## Adding Checks

Promote repeated manual checks into Bun scripts (root `package.json` and
`tooling/`) once they have been run manually twice. `bun run verify` should
remain the single command a contributor needs before committing.

## Browser journey gate

Run `bun run test:browser` after `bun run infra:up`. It builds production Next.js,
checks emitted browser assets for synthetic server-secret/origin canaries,
creates an isolated test database using the existing lifecycle helper, and
launches the real API, web server, loopback ingress and Chromium. Backend-owned
fixtures live in `apps/api/test/browser/reading.browser.ts`; the web app still
accesses every record through HTTP. Capture email and disabled external
telemetry are forced. Never point these tests at a development or production DB.

For a focused retry, pass Bun test options through the same runner, for example
`bun run test:browser --test-name-pattern 'preserves private sharing'`. This keeps
the production build, canary checks and disposable database lifecycle intact;
record filtered results separately from the full suite.

Install a browser with `bunx playwright install --with-deps chromium`, or use
existing `/usr/bin/google-chrome-stable`. `BROWSER_CHROME_PATH` can select another
local Chromium executable. CI installs Playwright Chromium explicitly. No
missing-service or missing-browser case becomes a skipped pass.

The journey covers explore and public hubs/continuation (including no JavaScript),
pretty URLs, collection and reference reading, explicit public previews for owners, handle/slug
rename durability, hidden/missing equivalence, unpublish/history, token
rotation, session expiry, real browser-cookie issuance, error recovery and
Origin enforcement for unsafe requests. It also checks keyboard interaction,
saved section metadata, independent client read budgets, forged source headers,
Escape-cancelled document navigation and reload recovery after access revocation,
320/390/768/1280 px widths, enlarged text, reduced motion and clipboard fallback.
API suites cover readiness and dependency failures with isolated fixtures;
shared development services stay running. Browser journeys also cover account
settings, capture, discussion, attribution/History, invitations and operations.
Tests leave synthetic screenshots under `/tmp/w3-*.png`; their
processes and database are owned fixtures. Do not run two web builds or dev
and production browser builds concurrently in the same checkout (`.next` is shared).

After dev-orchestrator or web-entry changes, run `bun run test:dev`. It migrates
a disposable database, forces capture email, starts the real dev loop on
temporary ports, checks SSR, direct API CORS and the absence of a web API rewrite,
and verifies owned listeners
stop on shutdown. Infrastructure stays up. Port-precedence fixtures also run
in `bun run tooling:test`. The two-client browser budget regression uses Node's
HTTP client only for source-bound socket fixtures because Bun's client ignores
`localAddress`; both applications and all test runners use Bun.


`TEST_DIRECT_API=1 bun run test:browser` repeats browser scenarios with a separate
public API port and rejects API paths on the web ingress. Runtime public-origin
configuration allows the same production build to test either topology. The API
owns callback/session/factor handling; tests assert callback URLs use its origin.
