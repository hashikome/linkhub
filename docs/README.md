# Documentation

The navigation map for repository knowledge. Start with the root
[AGENTS.md](../AGENTS.md), then [PRODUCT.md](../PRODUCT.md) (the PRD),
[ARCHITECTURE.md](../ARCHITECTURE.md) (the system-architecture authority) and,
for web work, [DESIGN.md](../DESIGN.md) (the visual system). New contributors
walk the [onboarding guide](guides/developer-onboarding-walkthrough.md) first.

## Documentation spaces

| Space | Use it for |
| --- | --- |
| [backlog/curation-and-paid-services.md](backlog/curation-and-paid-services.md) | Accepted curation and paid-service direction awaiting implementation |
| [design-docs/](design-docs/README.md) | Focused current designs: domain, web, platform and delivery |
| [engineering-decisions/](engineering-decisions/README.md) | Settled foundations and their rationale; binding until superseded |
| [exec-plans/](exec-plans/README.md) | Active ExecPlans, completed plans and the tech-debt tracker |
| [runbooks/](runbooks/) | Local development, verification, migrations, release, operations |
| [guides/](guides/) | The onboarding walkthrough, pinned to a reviewed commit |

## Top-level policies

- [CORE_BELIEFS.md](CORE_BELIEFS.md) — engineering principles.
- [SECURITY.md](SECURITY.md) — tenant isolation, authorization, tokens and the
  auth boundary.
- [RELIABILITY.md](RELIABILITY.md) — idempotency, concurrency, jobs and data.

## Reading status and history

Designs state what is implemented and label accepted work that is still planned.
`PRODUCT.md` §11 owns delivery order; code and shared contracts establish the
implemented API. An accepted decision can precede its implementation.

Current designs and runbooks describe behavior directly. Resolve contradictions
against the implementation and latest accepted decision, then update the current
design and its summaries together; do not leave conflicting instructions as an
append-only sequence of updates. Keep dates and before/after
accounts in `CHANGELOG.md`, completed plans and ADR rationale when they
explain a decision, migration or acceptance limit. Completed plans are historical
evidence, not current implementation instructions.

Current branding is **ntumie.** in display text and `ntumie` in repository and
package identifiers ([ADR-0060](engineering-decisions/0060-ntumie-repository-and-branding.md)).
Earlier names in historical ADRs, completed plans and changelog entries record
their original context. Physical storage and seed identities retain legacy names
as documented compatibility exceptions in the
[local-development runbook](runbooks/local-development.md#existing-checkout-renamed-to-ntumie).

## Where things go

```text
idea or question -> PRODUCT.md §10 open decisions
  -> focused design in design-docs/, when needed
  -> engineering decision, when a durable foundation is settled
  -> active ExecPlan, when implementation is ready
  -> completed plan, CHANGELOG entry, docs updated
```

Renames and field changes are changelog material, not decisions. Disposable
context lives in the git-ignored `ref/`; the shared Hashikome workspace
mapping is in [PLANS.md](../PLANS.md#shared-hashikome-workspace).
