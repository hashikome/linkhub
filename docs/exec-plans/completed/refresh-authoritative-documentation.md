# Refresh authoritative documentation

## Purpose / Big Picture

Make current documentation describe the shipped implementation and settled future
work accurately. Remove obsolete instructions and incidental change narration;
preserve history where it explains an ADR or completed milestone.

## Progress

- [x] (2026-10-10) Inventory current designs, runbooks, ADRs and active plans.
- [x] (2026-10-10) Reconcile identity, authentication, reading/sharing and delivery guidance against code.
- [x] (2026-10-10) Correct indexes, active-plan assumptions and ADR amendment chains.
- [x] (2026-10-10) Validate documentation links, guide freshness and the verification gate; record completion.

## Surprises & Discoveries

Some current summaries still describe Google as existing-account-only, and older
ADR amendments still assert permanent handles despite later supersession. The
onboarding guide also pointed readers at the retired email-change workflow.
Current UI documents contradicted implemented sharing, account lifecycle, service
invitation codes, item attribution and unified audit/collection views. PRODUCT.md
retained permanent-handle and deferred-sharing summaries, so those authorities
needed correction together. Capture receipts have no scheduled expiry or cascading
account foreign key; retention debt remains explicit rather than claiming account
deletion is disabled.

## Decision Log

- 2026-10-10: This pass changes documentation, not product policy. Current designs
  describe behavior directly; ADR context and completed plans retain dated evidence.
- 2026-10-10: Planned billing, imports and SSO remain explicitly planned. A newer
  decision does not establish that an unimplemented feature has shipped.

## Outcomes & Retrospective

Current designs, policies, runbooks, indexes and active plans describe the implemented
contracts and clearly label future work. Root product and architecture summaries
were reconciled where they repeated stale guidance. ADR amendments identify the
current decision without erasing original rationale; completed plans retain their
historical evidence. No runtime behavior was changed in this documentation pass.

## Context And Orientation

PRODUCT.md owns scope and status; ARCHITECTURE.md owns boundaries. Current API,
shared contracts and web behavior establish what is implemented. docs/design-docs,
runbooks, policies and active plans guide current work. ADRs record decisions;
completed plans record historical implementation and verification evidence.

## Plan Of Work

Audit current policy summaries and detailed contracts, inspect corresponding code,
then correct inconsistent guidance and index labels. Keep supersession visible in
ADR status/amendments without erasing original rationale. Update stale active-plan
assumptions and retain unfinished work. Validate links and guide freshness.

## Concrete Steps

Use targeted repository searches and code reads; run bun run check:docs,
bun run check:guide-pin, git diff --check and the canonical bun run verify gate.

## Validation And Acceptance

Current guidance agrees on Google creation consent and same-email linking, fixed
account email, contextual recovery, handle retirement/cooldown, backend-owned
routing/avatars, reading interactions and implemented versus planned features.
All local links/anchors resolve; historical decisions point to current replacements.

## Idempotence And Recovery

Documentation edits are reversible and preserve existing uncommitted work. Do not
change runtime behavior, reset databases or start development servers for this pass.

## Artifacts And Notes

- Full `bun run verify` passed in the isolated checkout
  `/tmp/nslinkhub-security-final-20261010`, avoiding the live development build.
  Log: `/tmp/nslinkhub-docs-refresh-verify.log`.
- Documentation links/anchors and onboarding guide freshness checks passed.
- Final documentation edits received a fresh docs, guide and whitespace check.
- No development servers were started for this pass.

## Interfaces And Dependencies

No API, dependency or schema changes. Guide commit pin remains subject to its
existing freshness check; update prose to the current working tree without inventing
a reviewed commit.
