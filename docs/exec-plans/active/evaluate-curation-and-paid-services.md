# Deliver document curation and paid services

This ExecPlan is a living document governed by `PLANS.md`. It records the accepted ADR-0028 direction and staged future implementation;
this documentation task does not implement billing or change runtime defaults.

## Purpose / Big Picture

Deliver free public curation and ordinary imports, paid AI/DOCX convenience and
paid private collaboration under normal collection permissions. Complete reviewed
imports, settle numeric allowances and lifecycle rules, and implement backend
entitlements with public-by-default creation and clear private choices.

## Progress

- [x] (2026-10-10) Captured founder workflow, candidate packaging, document-import
  design and decision conflicts in repository docs and backlog.
- [ ] M1 — Complete the existing reviewed-import foundation and fixtures.
- [ ] M2 — Compare deterministic document extraction and assisted grouping.
- [ ] M3 — Validate usefulness, willingness to pay and processing costs.
- [x] (2026-10-10) Packaging and public creation defaults accepted in ADR-0028,
  superseding the conflicting ADR-0016 and earlier private-default direction.
- [ ] M4 — Set numeric allowances, prices, processing budgets and lifecycle rules.
- [ ] M5 — Write a separately scoped implementation plan for approved entitlements/jobs.
- [x] (2026-10-10) Accepted paid link-health checks and owner-approved redirect
  updates in ADR-0029; recorded the narrow ADR-0007 exception.
- [ ] M6 — Deliver link monitoring, notifications and redirect review after shared
  entitlements/worker budgets; independent of AI/DOCX implementation.

## Surprises & Discoveries

Paul accumulated 72 pages of links by copying them since starting online learning
in 2022, then fell back to self-messaging. Communities also circulate resource
documents. His friend reads, shares and closes links, which is a distinct workflow
that may not benefit from a persistent collection. The conversation generated
hypotheses; it did not validate a market or price.

The follow-up explicitly keeps ordinary imports free and makes AI/DOCX paid.
ADR-0028 resolves private-sharing and creation-default conflicts. Runtime code
still uses private creation defaults and has no billing or quota enforcement.

## Decision Log

- User follow-up (2026-10-10): Gravatar profile avatars are the first implementation
  task after whole-diff review and commit. Richer Gravatar profile display is a
  later paid feature; field selection, consent, refresh and entitlement rules
  remain open. Reuse the existing own-account avatar proxy; see the
  [identity design](../../design-docs/identity-and-handles.md#gravatar-follow-up).

- User clarification (2026-10-10): only the redirect-review process may update
  saved URLs, never generic PUT/PATCH. Each approval requires an explanatory note.

- User confirmed free bookmarks/CSV imports and unlimited public collections,
  public links and contributor invitations; paid AI curator and DOCX extraction.
- Public is the new-collection default, with an explicit private option and a
  limited free owner-only allowance. Existing private content is preserved.
- Owner-paid private sharing gates both contributor and viewer invitations and
  private links; participants need no paid plan. Contributor grants cannot bypass it.
- Reuse reviewed drafts and backend policy. DOCX means an uploaded export, including
  Google Docs exports; no direct Google connector or AI provider selected.
- Record accepted direction now; runtime rollout follows complete backend quotas,
  entitlement checks, lifecycle rules and visibility choices across clients.

## Outcomes & Retrospective

Commercial boundaries and defaults are decided. Prototype, price/allowance
validation, lifecycle details and implementation remain outstanding. A separate unpublished notebook entry tells
Paul's origin story; that article is not the product specification. Paul explicitly restricted the notebook
and portfolio to motivation and capabilities; commercial details remain here.

## Context And Orientation

`PRODUCT.md` owns scope/order. `docs/design-docs/monetization.md` separates the
accepted direction from current development behavior. `docs/design-docs/ai-curation.md` describes
extraction and proposal review. `docs/backlog/curation-and-paid-services.md` records
outcomes and unresolved choices. The active `deliver-bulk-import.md` plan is the
prerequisite: today `apps/api/src/modules/imports/` imports CSV/bookmarks directly.
`ResourcesService` owns section validity; collection policy owns access.

## Plan Of Work

M1 delivers the existing reviewed-import plan, including explicit hub creation,
owner-only destinations, source/folder structure, nonempty sections and retry-safe
commit. Preserve bounded source provenance useful to later document processing.

M2 uses synthetic or explicitly consented DOCX exports with a manually
reviewed link inventory. Compare deterministic extraction followed by bounded
structured suggestions with an agent where necessary. Measure omitted/invented
URLs, grouping usefulness, context fidelity, latency and cost. Do not call paid
providers or transmit personal documents as part of this documentation task.

M3 asks people who maintain guides to complete an import and review it. Include an
occasional migrator, a community guide maintainer and a read/share/close person.
Observe review effort and whether a collection remains useful after the initial
save. Ask about concrete paid tasks; record responses without turning interest
into revenue forecasts. Compare per-job credits with recurring collaboration.

M4 sets private allowance counts, prices, grant expiry/grace, transfers,
refunds/failed-job charging, retention and provider handling. Free/paid boundaries
and public creation defaults are already settled by ADR-0028. Do not reopen
ordinary paid imports as a prerequisite to implementing the free import journey.

M5 scopes backend entitlements and metered jobs only after those decisions. Require
atomic quotas, idempotent usage, revocable normal grants, explicit review/commit,
and accessible native web delivery. Select a payment/AI provider through that
implementation plan, with real cost and data-handling constraints. Roll out backend
public defaults with visibility choice in capture/manual/import creation. Exercise
public-to-private changes, existing contributor grants, transfers, invitation
acceptance and entitlement expiry; none may retain a free private-sharing bypass.

M6 implements the [link-health design](../../design-docs/link-health.md): persist
observations and review state, schedule entitled checks outside write transactions,
confirm failure/recovery, group notifications and expose owner review commands.
Before coding, settle cadence, quota, retry/freshness/retention and expiry rules.
Approval must revalidate ownership, entitlement, current URL/version and destination;
require and retain a nonblank explanation; keep resource identity/attribution and
reject stale or duplicate updates. Use a dedicated POST review approval, not
resource PUT/PATCH, and derive its destination from the validated suggestion. Never
silently rewrite links, including across collections sharing the same address.

## Concrete Steps

For this documentation slice run `bun run check:docs` and `git diff --check`.
For prototypes, record fixture inventories and evaluation outputs without secrets
or personal documents in Git. Before any application slice is complete, run
`bun run verify` and its focused production browser journeys. Use disposable
migration fixtures for schema changes; no development reset.

## Validation And Acceptance

- Extracted links have source locations; an unlinked topic is never a fabricated URL.
- User corrections survive retries, and failed rows never create empty sections.
- AI proposes only; backend permissions and validated commits remain authoritative.
- Import requires an existing owned hub; contributor access grants no import rights.
- Bookmarks/CSV and public collaboration stay free; AI/DOCX require paid entitlements.
- New collections default to public with a private choice; draft data stays private.
- Free owners cannot share private collections through contributor grants or links,
  including after public-to-private changes. Paid owners can invite either role.
- Paid recipients cannot substitute for the collection owner's entitlement.
- A downgrade never publishes or deletes private content and preserves owner export.
- Monitoring distinguishes transient/blocked checks from confirmed unavailability,
  reports recovery, and does not repeat an alert on every poll.
- Redirect proposals change a URL only on explicit valid owner approval, with
  authorization, safe-hop, conflict, retry and atomic audit coverage. Require the
  reason note and persist it atomically; test missing/blank/invalid/over-limit notes
  and URL-change rejection through generic PUT/PATCH, even with a note.
- Cost and willingness-to-pay observations are recorded separately from assumptions.

## Idempotence And Recovery

Keep all implementation and documents uncommitted pending review. Evaluation jobs
use bounded disposable data, can be cancelled and never mutate a real collection.
If a provider fails, retain the user's reviewable draft and avoid duplicate charges.
Declining an AI proposal leaves collections unchanged. Existing private collections
are never published by migration or billing events.

## Artifacts And Notes

Source: user-supplied conversation and screenshots, 10 October 2026. The original
LinkedIn text supplies historical motivation but not an exact project-launch date.
The Claude SDK overview is linked in the focused design. Prototype evidence pending.

## Interfaces And Dependencies

No new dependencies selected. Reuse import-draft/resource contracts and the policy
service. Any entitlement, budget or derived-state decision belongs in the backend;
web, extension and other clients consume the same contracts.
