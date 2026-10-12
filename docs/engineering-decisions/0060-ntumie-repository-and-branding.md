# ADR-0060: Apply ntumie. across product and repository

Status: Accepted
Date: 2026-10-12

## Context

ADR-0059 selected **ntumie.** and `ntumie.link` while retaining the LinkHub
implementation and repository. Paul subsequently chose to align the underlying
repository, portfolio filename and current product references with the name.

## Decision

Use **ntumie.** as the display name, including its trailing dot. Use `ntumie`
for repository, checkout and package identifiers, including `@ntumie/*`.
Apply the name to app, email, API display metadata and maintained documentation.
README and the handbook introduce it as “formerly LinkHub.” Preserve historical
accounts of LinkHub and earlier decisions rather than rewriting their chronology.

The portfolio project lives in `ntumie.md` at `/w/ntumie/`; redirect
`/w/nslinkhub/` and update related notebook entries. Drafts remain unpublished;
the project will show the naming entry automatically when it is published.
Handbook chapters use `ntumie/` with redirects from their former addresses.

This supersedes ADR-0059's retained-codebase and deferred-branding decisions.
Its spelling, chosen domain and slogan remain accepted. Physical database and
volume names remain compatibility identities to preserve data. Existing origins,
credentials, schema, API fields and immutable routes do not change with branding.
Domain purchase, public launch, source publication and deployment remain separate.

## Consequences

Review package resolution, public copy and cross-repository links together.
Legacy references may remain in historical records, storage identities, redirects
and recorded narration. Explain those exceptions; do not manufacture a new audio
recording by changing its transcript. Public references use the selected product
name and link to the same maintained project and repository under their new names.
