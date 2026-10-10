# Temporary Implementation Context

This directory is a disposable, worktree-local scratch area for implementation
context. Its contents are ignored by git except for this README.

Use `ref/` for short-lived material such as:

- external reference notes gathered for the current task;
- session-starter notes for the next working session;
- generated scaffold inspection notes and disposable scaffolds;
- temporary API examples, logs, and command output;
- migration SQL copied for review;
- implementation checklists that help execute an active ExecPlan;
- notes being handed off to or received from sibling projects.

Do not store secrets, credentials, PII, production data, or the only copy of a
decision in this directory.

Before completing an ExecPlan:

1. Promote durable decisions and findings into `docs/`, code comments, tests,
   or tooling.
2. Add concise evidence to the ExecPlan when it helps future work.
3. Delete temporary references that are no longer useful.

Completed ExecPlans must remain understandable without `ref/`.

Keep at most one session handoff, `next-session.md`, containing only unfinished
work and context needed to resume it. Completed work and verification evidence
belong in the completed ExecPlan and changelog, not a growing handoff archive.
Keep any still-needed original import input distinct from disposable scripts;
do not delete it merely because an implementation session has ended.
