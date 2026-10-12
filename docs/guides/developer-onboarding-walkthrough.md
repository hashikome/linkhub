# Developer Onboarding Walkthrough

The onboarding route for developers and coding agents new to this repository:
six hands-on sessions covering local development, product rules and verification. Repository docs remain
authoritative; this guide orders them and pairs them with hands-on work — it
never restates what a runbook, design doc, or the changelog already owns.

**How to use this guide: one session per sitting, in order, and do not read
ahead.** Each session is 30–60 minutes, tells you exactly what to do and what
to read, and ends with a checkpoint — a few questions you should be able to
answer in your own words before continuing. Reading the whole file in one go
is the failure mode this structure exists to prevent. Every file is a
clickable link.

**Pin:** verified against commit `5074c2c533359cc6925c7314ef393b0e0e15e286`. This is enforced, not honor
system: `check:guide-pin` (part of `bun run verify`) fails when any file this
guide links changes after the pinned commit. To clear it, reread the affected
sessions, fix any drift, and move the pin to the latest commit — in a
guide-only commit, which never re-triggers the check. `docs/exec-plans/` and
`CHANGELOG.md` are exempt by design: this guide points at them rather than
restating them. The pre-push hook runs this check; it never edits the guide or
advances the pin automatically. Review and commit source changes first, then
review this guide against that commit and record the pin before pushing.

---

## Session 1 — Make It Run (do first, read nothing yet)

Goal: a working local stack and a green verification before any theory.

These commands assume a fresh checkout. For an existing checkout renamed to
ntumie, first follow the
[volume-preservation steps](../runbooks/local-development.md#existing-checkout-renamed-to-ntumie)
before starting Compose, so the renamed project keeps the original development data.

```bash
bun --version            # expect 1.3.x
docker compose version
bun install              # prisma generate (postinstall) + wires the pre-push verify hook
bun run infra:up         # PostgreSQL 18 + Redis 7
(cd apps/api && bunx prisma migrate deploy)
```

No `.env` is required — dev is zero-config: every default is in code and
agrees with [compose.yml](../../compose.yml). Anything you *do* provide is
honored (resolution: exported env var → optional `apps/api/.env` → in-code
default), so overriding a port is one `.env` line.

```bash
bun run verify           # the canonical gate — must be green
```

If this checkout already has a development server running, use
`bun run verify:isolated` instead: it runs the same gate in a temporary checkout
without writing into the active server's build directory.

While it runs, skim what it does in
[verification.md](../runbooks/verification.md) (boundaries, local documentation links,
this guide's freshness pin, typechecks, format/lint, tooling/email tests,
build, unit tests, isolated database lifecycle checks and e2e).

```bash
bun run dev              # infra + API :4004 + worker + web :3004
```

In a second terminal:

```bash
curl -s localhost:4004/api/v1/health | jq     # { status: "ok" }  (liveness)
curl -s localhost:4004/api/v1/status | jq     # postgres + redisQueue "ready"
```

Open http://localhost:4004/api/docs — Swagger for every route you will use
in Session 3.

**Checkpoint 1** — you should have observed:

- [ ] `bun run verify` green end to end.
- [ ] `/health` and `/status` return different shapes — why do both exist?
- [ ] The API runs on 4004. What runs on 3004, and how does it reach the API?

---

## Session 2 — What This Product Is (the one heavy-reading session)

Goal: the product model and the invariants, from the sources of truth.

Source-of-truth hierarchy, one paragraph: [AGENTS.md](../../AGENTS.md) is the
map and the non-negotiable invariants; [PRODUCT.md](../../PRODUCT.md) defines
the product (the PRD); [ARCHITECTURE.md](../../ARCHITECTURE.md) is the
system-architecture authority; [DESIGN.md](../../DESIGN.md) is the visual
system; `docs/design-docs/` are focused designs (map: [docs/README.md](../README.md));
[engineering decisions](../engineering-decisions/README.md) record settled
foundations; `CHANGELOG.md` is what
happened, in order.

Read, in this order:

1. [PRODUCT.md](../../PRODUCT.md) — end to end. Hold: at most one hub per user
   (Drive-style sharing); collections are independent; references stay within the same owner's hub and grant no
   access to their destinations; Add a link recognizes readable same-hub collection addresses as references;
   other collection URLs remain ordinary links. Tags use normalized relations
   (API names remain arrays);
   sharing = link / direct / publish; export reads like a Google Doc;
   sign-in is passwordless: email codes and explicitly confirmed Google identity
   can create accounts; registered passkeys also sign in. Enrolled protection applies to
   email/Google fallback. Hubs have one owner and never transfer, while
   collections can. People have usernames and optional hubs; signup can explicitly
   create a named hub, or the first successful ownership operation creates one.
2. [ARCHITECTURE.md](../../ARCHITECTURE.md) — the domain model, codemap,
   runtime and architectural invariants.
3. [tenancy-and-access.md](../design-docs/tenancy-and-access.md) — the access
   model (owner → direct share → active link → published, independently per
   collection) — and [identity-and-handles.md](../design-docs/identity-and-handles.md)
   for handles and the Web URL scheme: `/c/<id>` is the only collection address;
   `/@handle` resolves hubs (ADR-0053).
4. [AGENTS.md](../../AGENTS.md) § Non-Negotiable Invariants — all of them.

**Checkpoint 2** — answer in your own words:

- [ ] Why does `/c/<id>` survive title/handle renames and ownership transfer?
- [ ] Why does adding a collection reference never grant destination access?
- [ ] Why does a route never carry `hubId` on writes?
- [ ] What are the four access sources, and why do references not propagate them?

---

## Session 3 — Walk The Product Over Curl

Goal: every core capability exercised by hand. API running (`bun run dev`).
Use a fresh test account for the email-code example below. An account with
passkeys or TOTP returns a pending factor challenge instead of a usable token
until its additional proof completes.

```bash
# Request a code. For real mail, configure Resend and run the email worker
# (see local-development.md); this intentionally sends to your own mailbox.
curl -si localhost:4004/api/v1/auth/code/send \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com"}'
# Enter the received code and explicitly consent to creating an account without a hub.
curl -si localhost:4004/api/v1/auth/code/verify \
  -H 'content-type: application/json' \
  -d '{"email":"me@example.com","code":"<received-code>","name":"Paul","createAccount":true}' \
  | grep -i set-auth-token
export T="<token>"

# Profile is the client entry point: username, displayName, optional handle and hubId
curl -s localhost:4004/api/v1/profile -H "Authorization: Bearer $T" | jq

# Create two explicitly private collections (the default is published), then add a reference
curl -s localhost:4004/api/v1/collections -H "Authorization: Bearer $T" \
  -H 'content-type: application/json' \
  -d '{"title":"Software Engineering","published":false}' | jq .data.id
curl -s localhost:4004/api/v1/collections -H "Authorization: Bearer $T" \
  -H 'content-type: application/json' \
  -d '{"title":"Essentials","published":false}' | jq .data.id
export GUIDE="<id1>" TARGET="<id2>"
curl -s localhost:4004/api/v1/collections/$TARGET/resources/external \
  -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"url":"https://roadmap.sh","position":0,"tags":["Tool"]}' | jq .data.tags
curl -s localhost:4004/api/v1/collections/$GUIDE/resources/collection \
  -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d "{\"linkedCollectionId\":\"$TARGET\",\"position\":0}" | jq
# Tags come back lowercased. Reuse/cycles are allowed; permissions stay independent.

# Publish → discovery → the URL-scheme reads
curl -s -X POST localhost:4004/api/v1/collections/$GUIDE/publish \
  -H "Authorization: Bearer $T" > /dev/null
curl -s localhost:4004/api/v1/discover | jq '.data[].id'
# Read your actual hub handle from /profile; do not assume it matches your name.
HANDLE=$(curl -s localhost:4004/api/v1/profile -H "Authorization: Bearer $T" | jq -r .data.handle)
curl -s "localhost:4004/api/v1/hubs/by-handle/$HANDLE" | jq .data.hub
curl -s localhost:4004/api/v1/collections/$GUIDE | jq .data.id     # permalink
curl -s localhost:4004/api/v1/collections/$TARGET | jq .error.code # not_found: target is still private

# Link sharing: enable, note the ONE-TIME token, read anonymously with ?s=
curl -s -X PUT localhost:4004/api/v1/collections/$GUIDE/link-sharing \
  -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"enabled":true}' | jq
curl -s "localhost:4004/api/v1/collections/$GUIDE?s=<token>" | jq .data.title

# Export: the response IS the file (-OJ honors Content-Disposition)
curl -s -OJ localhost:4004/api/v1/exports -H "Authorization: Bearer $T" \
  -H 'content-type: application/json' \
  -d "{\"format\":\"pdf\",\"collectionIds\":[\"$GUIDE\"],\"expand\":true}"
ls *.pdf   # open it: H1 guide, H2 section, hyperlinked lines
# Default expand:false keeps references as links. Explicit expansion stops after
# one reference level; every target is authorized. Two collectionIds → a zip.

# Import: stage a creation CSV; bad addresses await repair
printf 'collection,section,url,tags\nReading,References,https://xyproblem.info,reference\nReading,References,not-a-url,\n' > /tmp/links.csv
DRAFT=$(curl -s localhost:4004/api/v1/imports -H "Authorization: Bearer $T" \
  -F sourceKind=csv -F file=@/tmp/links.csv | jq -r .data.id)
curl -s localhost:4004/api/v1/imports/$DRAFT -H "Authorization: Bearer $T" | jq .data
curl -s localhost:4004/api/v1/imports/$DRAFT/rows -H "Authorization: Bearer $T" | jq .data
# Let the worker resolve metadata; inspect collections and their ready counts.
# DRAFT_COLLECTION is a draft collection ID, not a saved collection ID.
DRAFT_COLLECTION=$(curl -s localhost:4004/api/v1/imports/$DRAFT -H "Authorization: Bearer $T" | jq -r '.data.collections[] | select(.title == "Reading") | .id')
# Review at /manage/import-export/$DRAFT?collection=$DRAFT_COLLECTION.
# Once a row is ready, queue this collection at the latest draft revision.
VERSION=$(curl -s localhost:4004/api/v1/imports/$DRAFT -H "Authorization: Bearer $T" | jq .data.version)
curl -s localhost:4004/api/v1/imports/$DRAFT/collections/$DRAFT_COLLECTION/commit \
  -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d "{\"version\":$VERSION,\"published\":false}" | jq .data
# The worker imports ready rows in batches. Read the collection again for jobState.
curl -s localhost:4004/api/v1/imports/$DRAFT/collections/$DRAFT_COLLECTION \
  -H "Authorization: Bearer $T" | jq .data.collections
# The bad address stays for repair. A later job reuses the saved collection.
# Drafts stay private until import; this example explicitly keeps the result private.

```

**Checkpoint 3**:

- [ ] Why are collection creation and adding a reference separate actions,
      and why does neither action grant access to the reference target?
- [ ] What proves the export needed no job queue?
- [ ] What happened to the CSV's bad row?

---

## Session 4 — Break It On Purpose (failure drills + the policy trace)

Goal: see the failure modes, then read the code that decides access.

```bash
# Drill 1: degrade the queue Redis — the product keeps working
docker stop ntumie-redis
curl -s localhost:4004/api/v1/status | jq        # "degraded"; redisQueue "unavailable"
curl -s localhost:4004/api/v1/discover | jq '.data | length'   # still serves
docker start ntumie-redis
curl -s localhost:4004/api/v1/status | jq        # "ready" again

# Drill 2: existence-hiding — unpublish, then read anonymously
curl -s -X POST localhost:4004/api/v1/collections/$GUIDE/unpublish \
  -H "Authorization: Bearer $T" > /dev/null
curl -s localhost:4004/api/v1/collections/$GUIDE | jq .error.code   # not_found (not 403)
```

Now trace why, through five files (read in this order):

1. [health.service.ts](../../apps/api/src/modules/health/health.service.ts)
   — why Redis-down is `degraded`, postgres-down is `unavailable` (503).
2. [redis-queue-readiness.service.ts](../../apps/api/src/modules/health/redis-queue-readiness.service.ts)
   — a fresh non-reconnecting client per check; the API holds no standing
   Redis connection.
3. [collection-policy.service.ts](../../apps/api/src/modules/hubs/collection-policy.service.ts)
   — **the heart of the product's security.** Follow `resolve()` and
   `resolveMany()` into their shared evaluator and read the independent grant
   checks slowly; note `requireRead` throws 404, not 403. Batched references
   still check each destination's access and current same-hub ownership.
4. [collections.service.ts](../../apps/api/src/modules/collections/collections.service.ts)
   — find `readCollectionView` (ID reads authorize here) and
   resource references (each destination is authorized separately).
5. [SECURITY.md](../SECURITY.md) — all of it, especially § Origins, CORS,
   and CSRF (exact-origin credentialed CORS and independent mutation checks).

**Checkpoint 4**:

- [ ] Why 404 instead of 403 for a collection you cannot read?
- [ ] Why may a reference in a readable collection have an unavailable target?
- [ ] Which browser Origin receives CORS permission, and why are authorization
      and CSRF checks still required?

---

## Session 5 — Configuration, Secrets, And The Gate

Goal: the config contract and the verification machinery, proven live.

Read first (short):

1. [secret.ts](../../apps/api/src/config/secret.ts) +
   [env.validation.ts](../../apps/api/src/config/env.validation.ts) — the
   `_FILE` contract and the two-directional validation (present-but-malformed
   always rejected; production requires the secrets).
2. [infra-deployment.md](../design-docs/infra-deployment.md) — § Origins
   (direct local API/CORS, production ingress, ports) and the secret-contract item.

Then prove the production guard is real:

```bash
cd apps/api
NODE_ENV=production bun run start   # refuses to boot: DATABASE_URL and
                                    # BETTER_AUTH_SECRET required in production
cd ../..
```

E2E creates, migrates and drops a disposable database per run. Run
`bun run verify` with local services available; inspect failing suites and
connectivity rather than resetting development data. Read
[verification.md](../runbooks/verification.md) for test-specific configuration
and [release.md](../runbooks/release.md) for the separate image rehearsal.
Apply committed migrations with `prisma migrate deploy` from `apps/api`.
Do not reset or seed an existing development database to complete verification.
Use the [migration runbook](../runbooks/migrations.md) for schema changes and
[local development](../runbooks/local-development.md) for intentional data setup.
With a development server running, use `bun run verify:isolated`.

**Checkpoint 5**:

- [ ] What is the three-step config resolution order in dev?
- [ ] What exactly refuses to boot in production, and why is the dev default
      auth secret rejected even when present?
- [ ] How does e2e isolate its database, and what cleanup can SIGKILL prevent?

---

## Session 6 — Web Journeys And Delivery Boundaries

Goal: understand the working web surface, accepted direction and release gates.

Read:

1. [identity-and-handles.md](../design-docs/identity-and-handles.md) for
   implemented identity, URL, fixed-email and handle-change contracts, then
   [people-and-hubs.md](../design-docs/people-and-hubs.md) for person profiles and optional hubs.
2. [transactional-email.md](../design-docs/transactional-email.md) and
   [auth-delivery-integration.md](../design-docs/auth-delivery-integration.md)
   for encrypted delivery, proof/session transactions and local/live acceptance.
   Read [passwordless-security.md](../design-docs/passwordless-security.md) for
   passkeys, Google sign-in and confirmed account creation, optional TOTP, protected recovery and the
   precise OAuth callback configuration.
   Inspect [code-email.tsx](../../packages/email/src/code-email.tsx), the shared
   base for code messages.
3. [web-product-experience.md](../design-docs/web-product-experience.md),
   [web-interface-system.md](../design-docs/web-interface-system.md) and
   [DESIGN.md](../../DESIGN.md) for journeys, interaction and theme values.
4. [release.md](../runbooks/release.md) for API/web image rehearsal, the opt-in
   GitHub-to-Dokploy production workflow and its acceptance requirements.
   Production uses shared product PostgreSQL/queue Redis with scoped roles/ACLs;
   migration and grant verification precede application promotion. Secret providers
   are optional: plain env files remain supported, while our deploy job can fetch
   credentials from 1Password. Local development and production are the permanent
   environments; same-host PR previews remain planned. [Engineering decisions](../engineering-decisions/README.md)
   owns settled rationale; [PRODUCT.md §11](../../PRODUCT.md#11-delivery)
   owns delivery status and order.

Install the browser for local acceptance with `bunx playwright install chromium`.
Local and CI browser checks use the Chromium pinned by Playwright;
`BROWSER_CHROME_PATH` is an explicit diagnostic override. The pre-push hook runs
`verify`; the separate browser gate below is required for web milestones and CI.

With `bun run dev` running, open the web on port 3004. Browse Discover, a public
hub and a collection. Follow an independent reference. With a configured local
sender and your own test account, save a link, edit the collection's details,
read History and update Settings. These actions use development data; automated
browser fixtures use their own database and capture email.

**Checkpoint 6:**

- [ ] Which URLs are durable, and which do share controls copy?
- [ ] How do the public API origin and web origin differ, and why is a separate
      internal API origin a server-only setting?
- [ ] Which person identity and collection roles are implemented, and which
      accepted changes are still planned?
- [ ] How does the shared Manage workspace keep collection authority separate
      from service-operator authority?
- [ ] What does local code/browser acceptance prove, and what remains for live
      email and deployment acceptance?
- [ ] Which checks does your next complete journey need?

Apply Impeccable for interface work under the repository design documents.
Run `bun run verify:isolated` before presenting a completed milestone when dev is running; use
`bun run verify:isolated test:browser` for browser changes and `bun run test:dev` for launcher
or web-entry changes. Keep builds separate from an active dev server's `.next`
directory. Current work lives in [active plans](../exec-plans/active/); completed
plans and the changelog retain evidence rather than instructions to rebuild
already delivered features.

---

## Appendix A — Wider Reading Map (only when a task needs it)

- API/persistence casing and the response envelope →
  [conventions.md](../design-docs/conventions.md)
- Idempotency, concurrency, jobs, data rules →
  [RELIABILITY.md](../RELIABILITY.md)
- Engineering principles → [CORE_BELIEFS.md](../CORE_BELIEFS.md)
- Shared Hashikome sign-on direction (not implemented) →
  [identity-sso.md](../design-docs/identity-sso.md)
- Monitoring baseline (Kuma/Dokploy; app telemetry retained, Alloy deferred) →
  [observability.md](../design-docs/observability.md)
- Prisma migration discipline → [migrations.md](../runbooks/migrations.md)
- Local commands and DB reset →
  [local-development.md](../runbooks/local-development.md)
- Plan format for substantial work → [PLANS.md](../../PLANS.md)
- Accepted compromises and their revisit triggers →
  [tech-debt-tracker.md](../exec-plans/tech-debt-tracker.md)

## Appendix B — Command Reference And Cleanup

Root scripts follow `<service>:<action>`; bare `dev` is the daily
orchestrator (see `package.json` for the full set):

| Command | Does |
| --- | --- |
| `bun run dev` | infra up + API/worker watchers + Next.js on :3004 |
| `bun run infra:up` / `infra:down` | local PostgreSQL + Redis |
| `bun run api:dev` / `api:test` | single-service loop / API tests |
| `bun run email:test` | email template tests |
| `bun run verify` | API/web builds, types, boundaries and source/integration tests |
| `bun run verify:isolated` | The same gate in a temporary checkout, preserving active dev output |
| `bun run test:browser` | production browser journey with isolated API/data fixtures |

Cleanup after the walkthrough:

```bash
rm -f *.pdf *.md.download /tmp/links.csv   # exported/downloaded artifacts
bun run infra:down                         # stop local services
```

The walkthrough account and collections live only in the disposable dev
database. For intentional cleanup use the local-development runbook;
verification never requires resetting that data.
