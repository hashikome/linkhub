# Route browser API traffic directly to the backend

## Purpose / Big Picture

Follow Pigfarm's transport pattern: browser API requests and Google callbacks
reach the API directly in development; production ingress routes API paths to
Nest without passing through Next. Keep native web forms and server rendering
as delivery adapters, with backend-owned authentication and business rules.

## Progress

- [x] (2026-10-10) Inspect Pigfarm, the local port registry and current routing.
- [x] (2026-10-10) Separate auth/API origin from web origin and remove Next API rewrite.
- [x] (2026-10-10) Add exact-origin credentialed CORS and update browser API addressing.
- [x] (2026-10-10) Verify direct Google callback, passkeys, session cookies and native forms.
- [x] (2026-10-10) Update architecture/security/runbooks and record verification results.

## Surprises & Discoveries

Pigfarm uses browser-to-API requests locally (API 4001, web 3000), exact-origin
credentialed CORS and production Traefik path routing. NSLinkHub currently uses
BETTER_AUTH_URL for both backend callbacks and frontend destinations, including
passkey origin, exported links and invitations. These responsibilities must split.

The first full verification found an export fixture hardcoding port 3000 despite
an explicitly configured single-origin test deployment. It now asserts the
configured web URL; passwordless API tests independently use distinct ports.

## Decision Log

- Decision: BETTER_AUTH_URL addresses the backend; WEB_ORIGIN addresses the web.
  Rationale: Explicit origins prevent OAuth callbacks and web redirects from
  being confused. Existing single-origin deployments remain supported.
  Date: 2026-10-10.
- Decision: Publish only the validated public API origin in rendered page config.
  Rationale: Preserve runtime-configured, prebuilt production images; never expose
  the private API_INTERNAL_ORIGIN or credentials. No build-time public env needed.
  Date: 2026-10-10.

## Outcomes & Retrospective

Implemented direct backend routing, separate public origins, exact credentialed
CORS and backend-owned avatar delivery. Full verification and dev-loop checks
pass. All 72 direct-origin browser scenarios passed across the full run plus
seven corrected reruns; five focused production-ingress scenarios also pass.
User-provided Google settings were applied to the ignored API environment; the
live provider now opens its sign-in page with the port-4000 callback. No real
user Google consent/login was submitted. Changes are ready for review.

The prior uncommitted loopback binding and local-port notes are included;
generated next-env.d.ts changes predate this task and remain separate.

## Context And Orientation

`tooling/dev.ts` starts API 4000 and web 3000. `apps/web/next.config.ts` currently
rewrites API paths. `apps/api/src/auth/` owns Better Auth, OAuth and factor flows.
`packages/config` separates browser-safe and private server configuration.
`apps/web/src/lib/http.ts` owns browser fetch, while native `/forms/*` adapters
support no-JavaScript workflows. API auth handlers mount before body parsers.

## Plan Of Work

Introduce shared strict public-origin configuration, thread web origin through
backend auth and public links, and add CORS ahead of the raw auth handler. Render
the safe API origin for browser reads/passkeys/images. Remove the Next rewrite.
Update development launcher and verification fixtures to exercise distinct ports.
Record the amended transport decision and correct callback registration guidance.

## Concrete Steps

Run `bun run verify` in a disposable checkout and `bun run test:browser` for
production-shaped routing plus focused direct-API browser coverage. Run
`bun run test:dev` to prove the launcher, explicit ports and direct API routing.
Inspect the real Google authorization URL without submitting user credentials.

## Validation And Acceptance

- Local Google redirect_uri uses localhost:4000/api/v1/auth/callback/google.
- Web redirects/passkey origin stay localhost:3000 (or configured WEB_PORT).
- Foreign/null/missing mutation origins fail closed; only configured web origin
  receives credentialed CORS. Preflight never consumes auth challenges.
- Session and factor cookies survive direct backend callbacks and page navigation.
- Browser requests no longer depend on a Next API rewrite; SSR/native forms work.
- Production ingress continues routing API traffic straight to Nest.

## Idempotence And Recovery

No schema changes or credential changes. Use disposable test databases and owned
ports; never reset development data. Restart local dev after launcher env changes.
Google console registration is external and may remain pending user configuration.

## Artifacts And Notes

- Final `bun run verify` passed in `/tmp/nslinkhub-security-final-20261010`:
  `/tmp/nslinkhub-direct-verify-final.log`.
- Full direct-origin browser run: 65 passed, seven failures corrected; targeted
  rerun: seven passed, zero failures. Logs:
  `/tmp/nslinkhub-direct-browser-all.log` and
  `/tmp/nslinkhub-direct-browser-corrected.log`.
- Production-shaped ingress: all five focused auth/avatar/origin scenarios pass
  in `/tmp/nslinkhub-direct-production-browser.log`.
- Dev launcher: `/tmp/nslinkhub-direct-dev.log` passed. In disposable checkouts,
  use the original COMPOSE_PROJECT_NAME so existing infrastructure is reused.
- Direct API browser coverage passed for passkeys, native authenticator/recovery,
  Google start, origin rejection and Gravatar (including no-JavaScript images).
- The full direct-origin browser run exposed old single-origin response mocks
  and a profile availability caller using readJson directly. Mocks now retain
  CORS; availability uses browserRead with its original five-second deadline.
  The virtual authenticator also retained a credential from deliberately rejected
  enrollment; clear that unregistered test credential before positive login.
- Dev-loop acceptance passed on disposable ports with the existing Compose
  project: direct API/CORS, no Next rewrite, SSR and clean shutdown. Its old
  root-page discovery assertion now targets /discover; cold-start is bounded.
- The real dev launcher was restarted. Live Google initiation returns callback
  `http://localhost:4000/api/v1/auth/callback/google` and PKCE S256. After the
  user registered the callback and supplied updated Google client JSON, the API
  environment was updated and the launcher restarted. Google now returns its
  `/v3/signin/identifier` page rather than redirect_uri_mismatch. Credential
  values were never printed or included in tracked/untracked proposed changes.
- Live web /sign-in returns 200 with backend port 4000 in public config; the API
  returns exact web-origin CORS; the old web /api/v1/auth/methods path returns 404.

Reference: `/home/ns/Person/stack/hashikome/pigfarm` (read-only). Do not copy secrets
into documentation or tests. Registry permits API 4000 and web 3000 exceptions.

## Interfaces And Dependencies

Better Auth 1.6.23, @better-auth/passkey 1.6.23, Next and Bun. API_INTERNAL_ORIGIN
remains server-only. Origins use the same hostname/scheme so host-only auth cookies
work across local ports; production retains one public origin. Preserve native
forms, source attribution, UUID authorization and existing factor policy.
