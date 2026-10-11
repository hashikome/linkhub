# ADR-0055: Allocate LinkHub local host application ports

**Status:** accepted
**Date:** 2026-10-11

## Context

The workstation assigns LinkHub offset +4, but application defaults previously
used web 3000/API 4000 as exceptions. Web 3000 collides with another local product.
Changing listener ports without matching origins breaks auth callbacks, redirects,
cookies and server-to-API requests.

## Decision

Use web 3004 and API 4004 as local host defaults. PostgreSQL stays on 5436 and
Redis stays on 6383. Keep explicit environment overrides, exact origin validation
and the shared-hostname/scheme cookie requirement. The dev orchestrator resolves
PORT from API-local Bun env files and WEB_PORT from web-local files, with shell
values taking precedence, then pins both ports and derives all public/private
origins from them.

Refuse an occupied selected port; do not auto-increment or terminate another
application. Keep production/container networking explicit: the API image and
Swarm service still set internal PORT=4000. Tests that use ephemeral listeners
continue to do so.

`bun run dev --built-web` starts the ordinary local API/worker loop with the
previously built production web server. It uses the same host allocation and
origin derivation; it is a local verification mode, not a deployment workflow.

## Consequences

Update local callback registrations when adopting the defaults. The Google
callback is `http://localhost:4004/api/v1/auth/callback/google`; the web origin is
`http://localhost:3004`. The repository cannot register external provider URLs.
Existing running stacks retain their pinned environment until deliberately
restarted. No data/volume rename or reset follows from this change.

The workstation registry at `../../docs/local-port-registry.md` records the
allocation across repositories. Pigfarm owns verification of its 3001/4001 move;
LinkHub does not change that product or claim unverified coexistence.
