# Allocate LinkHub local host ports

This ExecPlan follows `PLANS.md`.

## Purpose / Big Picture

A local LinkHub start uses web 3004 and API 4004, matching its +4 workstation
allocation. PostgreSQL 5436 and Redis 6383 retain their existing data. Occupied
ports fail clearly; no process is terminated and no automatic fallback is used.

## Progress

- [x] (2026-10-11) Read queued handoff and shared registry; inventoried defaults,
  origins, fixtures, docs and running processes. Existing dev stack uses 3000/4000.
- [x] (2026-10-11) User confirmed the protected integration run has finished.
- [x] (2026-10-11) Aligned local defaults, origins, env precedence and consumers; occupied-port tests pass without disturbing their listener.
- [x] (2026-10-11) Both allocated-port development and prebuilt production-web checks pass with disposable data, native code issuance/cookies, CORS and owned shutdown.
- [x] (2026-10-11) Focused direct-API browser acceptance passed (4 tests, 101 assertions).
- [x] (2026-10-11 11:01Z) Full browser gate passed: 98 tests, zero failures, one optional benchmark skip, 1,966 assertions.
- [x] (2026-10-11) Full isolated standard gate passed on the quieter host with short disk-backed TMPDIR.
- [x] (2026-10-11) Updated shared registry, docs, changelog and handoff.
- [x] (2026-10-11) Recorded completed verification and remaining external follow-ups; ready for review.

## Surprises & Discoveries

The API already resolves API-local Bun env files before startup; the orchestrator
only reads WEB_PORT from its own environment, so web-local overrides can diverge.
Production containers explicitly use API 4000; those internal contracts stay put.
The existing performance work is uncommitted and has a separate active plan.

## Decision Log

Use +4 for host application defaults, retaining explicit environment overrides.
Keep container internal ports and dynamic isolated test ports unchanged. Do not
reset databases/volumes or change Pigfarm. Date: 2026-10-11.

## Outcomes & Retrospective

Local port migration is implemented and active, with development and production-web
acceptance passing. Full standard and browser verification pass. Pigfarm live coexistence remains an explicit follow-up. The user subsequently
confirmed Google callback registration was updated.

## Context And Orientation

Runtime defaults are in `apps/web/server.ts`, `apps/api/src/main.ts` and
`packages/config/src/{public-origins,web-server}.ts`. `tooling/dev.ts` starts the
three host processes and checks ports; `dev-config.ts` resolves env precedence.
`../../docs/local-port-registry.md` owns workstation-wide allocations.

## Plan Of Work

Align host port/origin defaults and local documentation. Preserve strict origin
checks and explicit production configuration. Cover web/API env-file precedence
and occupied-port refusal, then exercise disposable local dev/production flows.
Update the registry's LinkHub rows only, after validation.

## Concrete Steps

Run focused tooling/web tests, `bun run verify:isolated`, and isolated dev/browser
checks sequentially. Preserve the current infrastructure volume via this host's
existing `POSTGRES_VOLUME_NAME`/`POSTGRES_VOLUME_EXTERNAL` settings when starting
dev fixtures. Never build into the active development `.next` directory.

## Validation And Acceptance

Defaults and ordinary starts use web 3004/API 4004. Sign-in redirects, exact-origin
CORS, generated links and server-to-API reads agree. Port collisions fail without
falling back or disturbing another listener. Container API stays 4000. Shared
registry and public setup docs match. External Google callback changes and
Pigfarm coexistence remain explicit follow-ups if not verifiable locally.

## Idempotence And Recovery

Use disposable fixture databases and owned listeners. Preserve existing dev
services, all import inputs, unrelated changes and container data. Change only
LinkHub rows in the shared registry; reread before editing to avoid concurrent loss.

## Artifacts And Notes

Queued instructions: `ref/next-session.md`, collision-free local ports section.
The protected integration run completed with user confirmation. The old owned
LinkHub dev orchestrator was gracefully replaced after acceptance; unrelated
processes remain untouched. The current dev stack stays running on 3004/4004.

## Interfaces And Dependencies

Bun workspace scripts, Next custom server, Nest bootstrap, better-auth public
origins, PostgreSQL 18 and Redis 7. Explicit deployment env overrides remain valid.

### Implementation evidence

`bun test tooling/dev-config.test.ts apps/web/test/http.test.ts` passed.
Both `test:dev --allocated` and `test:dev --allocated --built-web` passed in
isolated workspaces, with this host's existing external PostgreSQL volume
explicitly preserved. The allocated checks omit PORT/WEB_PORT overrides to test
real defaults. Initial code-send probe omitted fields from the real native form;
corrected the probe without changing the application contract.

Updated only LinkHub rows and the obsolete combined collision note in the shared
registry. Pigfarm source now sets web 3001 and tests API 4001; no Pigfarm listener
was running on those ports during inspection, so actual coexistence acceptance
remains pending with its owning session. No external Google setting was changed by the agent. The user subsequently
confirmed the callback settings were updated on 2026-10-11, then tested Google
sign-in and confirmed it works. This is user-tested acceptance; the agent did not
independently access provider settings.

### Host verification storage

All suites passed in the first full verify attempt, but the final web build failed
with EDQUOT writing `.next/cache/.tsbuildinfo`. `/tmp` is mounted with `usrquota`
and still showed free overall space. No other session’s files were removed.
Repeat gates with `TMPDIR=$PWD/test-results/t` on the repository
filesystem. This may also explain the earlier Chromium resource errors; verify
rather than assuming the relationship.

### Active development cutover

After both allocated-port acceptance modes passed and the user confirmed the
protected integration run ended, verified the existing LinkHub orchestrator's
PID/cwd/command, sent it SIGTERM, and started `bun run dev` normally. Live web
3004 and API 4004 both respond successfully; old 3000/4000 listeners are absent.
PostgreSQL and Redis container IDs and mounts were identical before/after. The
existing external PostgreSQL volume remains `nslinkhub_nslinkhub_pgdata`; no
volume/database rename or reset occurred. Pigfarm was not started or changed.

The first disk-backed TMPDIR was too long for Chromium's Unix singleton socket.
Using `$PWD/test-results/t` keeps the complete socket path under 108 bytes here;
all three diagnostics tests pass there. Also renamed the earlier diagnostics
regression to `.browser.ts`, so API test discovery no longer launches Chromium
before CI's browser-install step. The explicit browser runner still runs it.
This restores the separate-gate contract from ADR-0054.

### Final gate progress

The focused direct-API browser run passed all four selected journeys (101
assertions): native account creation/save, held-script early input, immutable
assets/profile isolation, and real runner-timeout diagnostic retention.

Standard verification attempts on the short disk-backed temporary root stopped
at different unchanged five-second fixture budgets: account registration, then
an email-invitation before/after hook (5.127s). At inspection the host load average
was 25 on eight logical CPUs; this suggests contention but does not establish a
fixture root cause. Keep the failures visible and do not relax deadlines.
Logs: `test-results/ports-verify.log`, `test-results/ports-verify-final.log`,
`test-results/ports-browser-direct.log`, `test-results/ports-browser-full.log`.

Full browser acceptance then passed: 98 tests, zero failures, one optional
benchmark skip, 1,966 assertions in 556.99s. The final standard gate passed
sequentially afterward with host load reduced (2.89 one-minute average).

### Final acceptance

`TMPDIR=$PWD/test-results/t bun run verify:isolated` passed in full after the
browser gate: source/documentation checks, tooling/email/API/web tests, production
builds and type checks. Log: `test-results/ports-verify-quiet.log`. No product
assertions or fixture deadlines were relaxed. All implementation remains
uncommitted for review; remote CI has not run this diff. The active development
stack remains on 3004/4004, with existing PostgreSQL/Redis data preserved.
