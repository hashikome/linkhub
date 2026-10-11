# Execution Plans

An execution plan, or ExecPlan, is a self-contained living document for a
substantial feature, migration, or cross-cutting change. It must be usable by a
contributor who has only the current working tree and the plan file.

Use an ExecPlan when work:

- spans multiple modules or applications;
- changes architecture, security, reliability, or data contracts;
- requires research, prototyping, or staged migration;
- is expected to continue across multiple working sessions;
- introduces a new repeatable workflow or repository check.

Small, local changes do not need an ExecPlan.

## Storage

Create plans under `docs/exec-plans/active/`. Use a short kebab-case filename
that describes the outcome. Move finished plans to `docs/exec-plans/completed/`.

Start from `docs/exec-plans/TEMPLATE.md`.

## Shared Hashikome workspace

LinkHub is listed in the shared planning workspace (`../workspace/`, local and
not in Git) as one product row that points here; the workspace never holds a copy
of this product's definition. Until plans are moved there, records map as follows:

| Workspace convention | LinkHub today |
| --- | --- |
| Product brief (`backlog/<idea>.md`) | `PRODUCT.md`, linked from the workspace row |
| Plan `README.md` (scope, state, next actions) | `PRODUCT.md` §11 Delivery |
| `plans/<idea>/tasks/` (implementation records) | ExecPlans in `docs/exec-plans/active/` |
| Completed task evidence | `docs/exec-plans/completed/` and `CHANGELOG.md` |
| Repository follow-ups (`<repo>/docs/backlog/`) | `docs/exec-plans/tech-debt-tracker.md` |
| Plan `refs/` and repository handoffs | `ref/` (git-ignored, disposable) |

Settled decisions stay in `docs/engineering-decisions/`. When plans do move,
keep one copy of each task and preserve status, rationale, evidence and links.

## Required Properties

Every ExecPlan must:

- be self-contained and define non-obvious terms;
- explain the user-visible or operator-visible outcome;
- name relevant files and modules using repository-relative paths;
- stay current as implementation proceeds;
- describe concrete verification commands and expected observations;
- record decisions, discoveries, and deferred work;
- remain safe to resume after a context reset or contributor handoff;
- remain understandable after disposable `ref/` material is deleted.

Do not treat an ExecPlan as a speculative proposal. Once implementation starts,
update it at every meaningful stopping point.

## Required Sections

Each ExecPlan contains and maintains these sections:

### Purpose / Big Picture

Describe what becomes possible after the change and how someone can observe the
result.

### Progress

Use timestamped checkboxes. Record completed, remaining, and partially
completed work accurately.

```md
- [x] (2026-07-03 09:00Z) Added the workspace layout.
- [ ] Add the hub policy service.
- [ ] Add sharing tests (completed: reader access; remaining: link rotation).
```

### Surprises & Discoveries

Record unexpected behavior, bugs, performance findings, and useful constraints.
Include concise evidence such as a command result or failing test name.

### Decision Log

Record implementation decisions with rationale and date.

```md
- Decision: Keep generated Prisma types private to the API.
  Rationale: Clients should depend on API contracts rather than persistence.
  Date/Author: 2026-07-03 / namestarlit
```

### Outcomes & Retrospective

At milestones and completion, compare the result against the original purpose.
State what shipped, what remains, and what should change next time.

### Context And Orientation

Explain the current relevant system state for a new contributor. Name files,
modules, and important dependencies. Do not rely on prior plans or chat
history.

### Plan Of Work

Describe the edit sequence in prose. Name the files and responsibilities that
change. Keep the plan concrete enough to guide implementation without copying
the eventual patch.

### Concrete Steps

List commands to run, working directories, and expected results. Use Bun
scripts for stable repository workflows.

### Validation And Acceptance

State behavior-based acceptance criteria and the tests, checks, or manual
observations that prove them.

### Idempotence And Recovery

Describe which steps are safe to repeat and how to recover from partial
completion. Call out migrations, generated artifacts, and destructive steps.

### Artifacts And Notes

Include short, relevant evidence such as logs, diffs, API examples, or links.
Avoid large pasted outputs.

Bulky, short-lived context may live under git-ignored `ref/` while work is
active. Before completion, promote durable findings into the ExecPlan or the
appropriate repository document and remove stale temporary references.

### Interfaces And Dependencies

Name important interfaces, package boundaries, external dependencies, and
version assumptions that the implementation must preserve.

## Prototypes And Parallel Paths

Use explicit prototype milestones when they reduce uncertainty. Keep prototypes
additive and testable. State the promotion or removal criteria.

During a migration, parallel implementations are acceptable when they preserve
a working path and make behavior comparison possible. Document how to validate
both paths and safely retire the old one.

## Deterministic Mechanics

ExecPlans should refer to repository scripts instead of restating repeatable
mechanics. Use agent judgment for exploration, implementation, and repair; use
Bun scripts (root `package.json`, later `tooling/`) for predictable checks and
generated artifacts. Promote a workflow into a script once it has been
repeated manually twice.
