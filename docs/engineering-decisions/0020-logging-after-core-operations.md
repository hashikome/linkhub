# ADR-0020: Design audit and wide event logging after core operations

**Status:** accepted  
**Date:** 2026-10-09

**Later qualification (2026-10-09):** The user subsequently authorized the bounded
core-effect capture in [ADR-0021](0021-bounded-audit-effects.md). The comprehensive
audit and wide-event milestones below remain deferred.

## Context

The fundamental product workflows are still being built. The existing hub and
service audit tables and Manage views do not establish a complete audit strategy.
Hub records also supply collection History and attribution; service records
participate in operator transactions and retry handling. Their current consumers
must be considered before changing the event model.

The latest audit review found unclear target semantics, read events dominating
the feed, and little evidence of actual changes. General before/after values
were never captured. Current lookup labels and item representations are not
historical snapshots. Further table presentation work cannot settle these issues.

The API already has sanitized request-completion telemetry through LogTape and
Sentry. This foundation does not constitute a domain-wide event strategy.

## Decision

Give audit logging and wide event logging separate later milestones in
[PRODUCT.md §11](../../PRODUCT.md#11-delivery). Finish the fundamental product
and service operations first, so their real workflows inform both strategies.
Do not resume the audit redesign or add broad domain telemetry as incidental
work in the intervening milestones.

- **Audit logging:** after the fundamental workflows are complete, inventory
  actor/action/target semantics, investigative needs, event coverage and write
  transaction boundaries. Decide the relationship between attribution, activity,
  security events and change history; permitted evidence and historical labels;
  authorization, integrity, retention, deletion and failure behavior. Then design
  the storage, contracts and reading experience together. Acceptance must prove
  useful investigations, isolation and truthful handling of missing old evidence.
- **Wide event logging:** once most system operations are implemented, inventory
  request, job and workflow boundaries and the operational questions they must
  answer. Define deliberate context, stable names, queryable attributes, final
  outcomes, correlation, privacy, sampling, retention and cost limits. Prove
  success/failure/abort coverage, concurrent isolation, safe exports and useful
  incident queries. A wide event collects relevant context about an operation
  into a structured event; it is not permission to capture arbitrary objects.

Create a dedicated ExecPlan for each milestone when it starts. Event catalogs,
schemas, storage changes, sampling rates and tooling rules remain undecided.

## Interim contract and consequences

Existing activity, operator/auth audit recording, History, attribution and
telemetry remain operational. Maintain the records required by those contracts
as fundamental workflows ship; this is not a mandate to expand audit coverage
or perfect the current audit UI. Fix correctness/security regressions as needed.
No data, routes, migrations or interfaces are removed by this scheduling decision.

Current audit tables and presentation are provisional, not acceptance of the
final audit experience. Preserve immutable IDs, hub isolation, operator authority
boundaries, data minimization and current retention obligations. Sampling of
operational telemetry must not silently become sampling of required audit records.
Existing deployment observability checks remain release requirements.

This qualifies ADR-0015's use of activity records as the hub audit trail: it remains
the implemented attribution contract, but is not a settled architecture for the
future audit system. The later design must explicitly amend any contract it
changes. Existing LogTape/Sentry and privacy choices also remain in force.

The tradeoff is that the current audit experience stays limited while core
operations take priority. The benefit is a strategy grounded in actual workflows
and investigations instead of repeatedly redesigning a partial event model.

## Evidence and references

The product owner's sequencing decision follows the 2026-10-09 audit review and
these readings. The articles inform the later work; they do not prescribe this
schedule or override repository contracts.

- [SonarSource: Audit logging](https://www.sonarsource.com/resources/library/audit-logging/)
  emphasizes purpose, event requirements, integrity, access and retention before
  implementation, and distinguishes audit evidence from application diagnostics.
- [Boris Tane: Logging sucks](https://loggingsucks.com/) argues for accumulated
  operation context and outcome-aware telemetry sampling.
- [Sentry: How to structure a log](https://blog.sentry.io/structure-a-log/)
  describes stable event names, scoped queryable attributes and final outcomes.
  Its ESLint examples do not change this repository's Bun/Biome toolchain.
- [Attribution and activity](../design-docs/attribution-and-activity.md),
  [service operations](../design-docs/service-operations.md), and
  [observability](../design-docs/observability.md) describe the current boundaries.
