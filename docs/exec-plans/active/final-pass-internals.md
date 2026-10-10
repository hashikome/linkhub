# Final pre-deployment pass on internals

## Purpose / Big Picture

Before production exists, rebuild the parts the 2026-10-07 code review flagged as
patched at the wrong depth or doing redundant work. Nothing here changes what
users see or do: same pages, same copy, same flows, same timing as perceived by a
reader. What changes is how titles are stored and fetched, how many queries a
page costs, how the write lock is opted out of, how form actions are routed, and
where Save a link drafts live. (User, 2026-10-07: big changes are welcome now;
the only blocker is a change to behaviour, business workflow or UX.)

## Progress

- [x] M1 Link titles: own storage, durable lookup jobs, shared fetch cache —
  delivered by [deliver-link-metadata](../completed/deliver-link-metadata.md) with a simpler
  shape than sketched below: one shared `link_metadata` row per address is the
  storage, the outbox job and the cache (no Redis cache), and the wire field is
  renamed to `title`.
  (2026-10-08: delivered first, as the link-metadata foundation — title,
  description and site name, text only — ahead of bulk import; see
  `PRODUCT.md` §11.)
- [ ] M2 Fewer queries: batched reference access, batched comment replies,
  comment writes reuse loaded rows.
- [ ] M3 One write-lock opt-out per controller.
- [ ] M4 Forms route as an action table with one status-to-notice mapping.
- [ ] M5 Save a link drafts in Redis (cookie holds only the draft id).
- [ ] M6 Smaller consolidations (DNS once, canonical duplicate check, shared
  helpers, API-suggested collection name).
- [ ] M7 Focus rings return when focus moves without a pointer press.
- [ ] Docs, changelog, gates (`bun run verify`, `bun run test:browser`).

## Surprises & Discoveries

None yet.

## Decision Log

- Held back (they change what users see): shrinking the 100-reply preview; the
  `fresh-document` scroll-reset workaround (needs a real-browser check first).
- Pre-deployment: schema changes go into new reviewed migrations on top of the
  squashed `0_init`; the dev database is reset and reseeded (`bun run db:seed`)
  if a change is easier that way. No compatibility code.
- Scope: preserve the implemented `viewer`/`contributor` contracts and labels.
  Paid entitlements follow ADR-0028 and are outside this internals pass.

## Outcomes & Retrospective

(To fill at completion.)

## Context And Orientation

- Titles: `apps/api/src/modules/resources/{resources.service,page-metadata,
  link-preview.controller}.ts`; capture in `modules/collections/capture.service.ts`;
  the web list re-read in `apps/web/src/components/paginated-list.tsx`.
- Jobs: the email outbox (`apps/api/src/email/outbox.ts`) and its BullMQ worker
  are the pattern for durable background work.
- Queries: `resources.service.ts#resourceView`, `comments.service.ts`
  (`list`, `replyPage`, `single`), `hubs/collection-policy.service.ts`.
- Lock: `apps/api/src/common/authority.interceptor.ts`, `imports.controller.ts`,
  `exports.controller.ts`, `operations.service.ts`.
- Forms: `apps/web/src/app/forms/[action]/route.ts`, `lib/form-server.ts`.
- Drafts: `apps/web/src/lib/capture-{draft,server}.ts`.
- Focus: `apps/web/src/components/focus-mode.tsx`.

## Plan Of Work

**M1 — Link metadata (complete).** The implemented storage, durable job and
shared cache are one `link_metadata` row per canonical address; the wire field
is `Resource.title`. See the
[completed plan](../completed/deliver-link-metadata.md) and
[current contract](../../design-docs/collections-and-resources.md#link-metadata).
Do not add per-resource title-status columns, a separate lookup table or a
Redis title cache.

**M2 — Queries.** Add `CollectionPolicyService.resolveMany(collections, viewer)`
(one active-viewer check, one owner lookup, one share lookup) and use it for
`collection_link` items in resource lists and exports. Comments: load accepted
answers for the page's questions in one query and the first reply page for all
questions in one windowed query (`ROW_NUMBER() OVER (PARTITION BY parent_id)`),
same reply count (100) and ordering. Mutations build their response from the
rows and access already loaded; `create` reuses the hold check it already did.

**M3 — Write lock.** Replace the method list exceptions, the two metadata keys,
the `ParsedUploadAuthorityInterceptor` subclass and the
`/operations` path regex with one `@Authority(mode)` decorator
(`lock` default, `read-only`, `after-parse`, `owns-transaction`) set on the
controllers that need it; one shared `recheckSession(actor)` used by the
interceptor and `OperationsService`.

**M4 — Forms.** `route.ts` becomes a `Record<action, handler>`; each handler is
a small function (capture, comments, profile, theme, sign-in flow, invitations,
operations). One `noticeFor(result, overrides)` maps API results to notice codes
consistently; one `withQuery(path, params)` helper replaces the repeated
`?`/`&` building.

**M5 — Drafts.** Store the draft JSON in Redis under its id (30-minute TTL, at
most three per visitor as today); the cookie keeps only the id. Remove
`fitDraft`, `sealDraft` size limits and the "too-many-links" fallback for
oversized drafts (the 2-link cap stays as validation).

**M6 — Smaller consolidations.** `fetchPageMetadata` reports a missing host
(ENOTFOUND/ENODATA) so the preview needs no second DNS lookup; the form compares
rows by the canonical URL the preview returns; shared helpers for invitation
state (`notifications.controller` + `administration.service`), time-id comment
cursors (`cursor.util.ts`) and the referenced-collection visibility rule
(resources + exports); the API returns the suggested new-collection name (same
text the form shows today).

**M7 — Focus rings.** Keep the keyboard-only look. In `FocusMode`, leave pointer
mode on any `focusin` that wasn't preceded by a pointer press in the same task,
so focus moved by assistive technology or script shows its ring.

## Concrete Steps

Per milestone: implement, `bun run check`, typecheck both apps, focused unit/e2e
tests, then the full gates in the isolated checkout. Migrations with
`bunx prisma migrate dev --create-only` + review; reset and reseed dev.

## Validation And Acceptance

- Saving a link shows its title as today; the page is fetched once for preview +
  save; a site that is down gets a title on a later retry without anyone opening
  the collection. Reads may enqueue missing/stale metadata under the implemented
  metadata contract; they never fetch pages under the authority lock.
- A resource page with 20 references runs a constant number of access queries;
  a comment page runs a constant number of reply queries.
- Only `@Authority(...)` decides lock behaviour; a new POST without it is locked.
- Every form action maps the same API status to the same notice.
- Two 2048-character links with 30 long tags survive a sign-in round trip intact.
- After a click, rings stay hidden; focus moved by script or a screen reader
  shows its ring; Tab still restores rings.
- All existing browser and e2e journeys pass unchanged in what they assert about
  the UI.

## Idempotence And Recovery

Each milestone is independently shippable and reversible before deployment. The
dev database can be reset (`docs/runbooks/local-development.md`) and reseeded.

## Artifacts And Notes

Source review: four parallel review agents (reuse, simplification, efficiency,
altitude), 2026-10-07; the items they raised are summarized in
`docs/exec-plans/tech-debt-tracker.md` and resolved here.

## Interfaces And Dependencies

- Implemented wire: `Resource.title` is the displayed title; metadata storage
  and refresh rules live in the collections-and-resources design.
- Planned internals: `@Authority(mode)`, `CollectionPolicyService.resolveMany`,
  and Redis `capture-draft:<id>` storage.
- Redis and the worker are already part of the local and production topology.
