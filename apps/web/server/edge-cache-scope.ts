import { AsyncLocalStorage } from "node:async_hooks";

// One request's edge-cache eligibility. server.ts opens the scope; any failed or
// writing API call during rendering closes it, so an error rendered with HTTP 200
// is never cached for every visitor. A global symbol shares the store between
// server.ts and Next's separately bundled server code.
export type EdgeCacheScope = { cacheable: boolean };
const key = Symbol.for("ntumie.edge-cache-scope");
const shared = globalThis as Record<symbol, AsyncLocalStorage<EdgeCacheScope> | undefined>;
shared[key] ??= new AsyncLocalStorage<EdgeCacheScope>();
const store = shared[key];

export function runEdgeCacheScope<T>(scope: EdgeCacheScope, work: () => T): T {
  return store.run(scope, work);
}

export function markEdgeUncacheable() {
  const scope = store.getStore();
  if (scope) scope.cacheable = false;
}
