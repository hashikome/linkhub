# ADR-0024: One audit log for every domain

**Status:** accepted  
**Date:** 2026-10-09

## Context

Separate content, operator and authentication audit models made one product's
history look like independent logs. The product owner explicitly requested one
AuditLog model, not merely a combined screen.

## Decision

`AuditLog` (`audit_logs`) is the only audit evidence model. Content, operation and
authentication writers use it inside their existing transactions. Category is an
event attribute for authorization and retention, not a separate model or UI tab.
The migration copies all original IDs, timestamps, state evidence and operation
replay fields before removing the three former tables; it never invents effects.
Unique replay keys, actor constraints and bounded content effects remain enforced.

`GET /api/v1/manage/audit` supplies one chronological, filtered, cursor-paginated
timeline. Owners see their hub's content events and their own authentication
records. Operators/admins additionally see operation and authentication evidence;
their service role grants no access to foreign private hub history. Authorization
and filters run before pagination; cursor timestamps preserve PostgreSQL microsecond precision. Scoped legacy API routes remain compatibility
views of this same model, not separate stores. The UI has no context switch.

Retention stays 90 days for authentication, 365 days for operations, and durable
for content attribution. Collection history reads only content-category records.
Targets remain immutable IDs without cascading foreign keys, so evidence survives
deletion. Request/replay fields are not returned by the timeline API.

## Superseded decisions

This supersedes ADR-0014's remaining Audit context split and the separate audit
storage described by ADR-0009. Their permission boundaries remain in force.
ADR-0015's attribution source is now content events in AuditLog; its attribution
rules are unchanged. ADR-0021's bounded evidence remains unchanged.

## Consequences

One model and one screen serve all current writers. New audited domains extend
the event contract rather than adding an audit table. Search, ordering and ID
copying work consistently across event categories.

## Cleanup amendment (2026-10-09)

Retire the preproduction `/me/audit` and `/operations/audit` compatibility views.
All clients use `/manage/audit` and the single AuditLogEntry projection. This
explicitly supersedes the compatibility-route decision above: there are no
production clients to migrate, and duplicate query implementations risk divergent
filtering and cursor precision. Authorization still precedes filtering/pagination;
a foreign hub filter returns no unauthorized content. Collection activity remains
a separate authorized projection for attribution, not a second audit store.
