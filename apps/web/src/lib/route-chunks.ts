// Route code preloading: map an app URL to the JavaScript chunks its page needs.
// Built after `next build` from each page's client-reference manifest; contains
// only immutable /_next/static file names, never data.

export type RouteChunks = { routes: [pattern: string, chunks: string[]][] };
type Manifest = { clientModules: Record<string, { chunks: string[] }> };

// "/c/[id]/page" → "/c/[id]"; route groups such as "(editor)" are not in URLs.
export function routePattern(manifestKey: string): string | null {
  if (!manifestKey.endsWith("/page")) return null;
  const segments = manifestKey
    .slice(0, -"/page".length)
    .split("/")
    .filter((segment) => segment && !/^\(.*\)$/.test(segment));
  if (segments.some((segment) => segment.startsWith("_"))) return null;
  return `/${segments.join("/")}`;
}

function dynamicCount(pattern: string) {
  return (pattern.match(/\[/g) ?? []).length;
}

// Static routes before dynamic ones, so "/about" never resolves as "/[handle]";
// routes with nothing to preload stay listed for that reason.
export function buildRouteChunks(manifests: Record<string, Manifest>): RouteChunks {
  const routes = new Map<string, Set<string>>();
  for (const [key, manifest] of Object.entries(manifests)) {
    const pattern = routePattern(key);
    if (!pattern) continue;
    const files = routes.get(pattern) ?? new Set<string>();
    for (const module of Object.values(manifest.clientModules))
      for (const chunk of module.chunks)
        if (chunk.endsWith(".js") && chunk.startsWith("static/")) files.add(`/_next/${chunk}`);
    routes.set(pattern, files);
  }
  // Chunks every route shares are already loaded by the first document.
  const all = [...routes.values()];
  const shared = new Set(all[0] ?? []);
  for (const files of all.slice(1))
    for (const file of shared) if (!files.has(file)) shared.delete(file);
  return {
    routes: [...routes.entries()]
      .map(([pattern, files]): [string, string[]] => [
        pattern,
        [...files].filter((file) => !shared.has(file)).sort(),
      ])
      .sort(
        ([a], [b]) =>
          dynamicCount(a) - dynamicCount(b) || b.length - a.length || a.localeCompare(b),
      ),
  };
}

export function compileRouteChunks(data: unknown): [RegExp, string[]][] {
  if (!data || typeof data !== "object" || !Array.isArray((data as RouteChunks).routes)) return [];
  const compiled: [RegExp, string[]][] = [];
  for (const entry of (data as RouteChunks).routes) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !Array.isArray(entry[1])) continue;
    const chunks = entry[1].filter(
      (chunk): chunk is string =>
        typeof chunk === "string" && /^\/_next\/static\/[^?#]+\.js$/.test(chunk),
    );
    const source = entry[0]
      .split("/")
      .map((segment) =>
        /^\[\[\.\.\..+\]\]$/.test(segment)
          ? "(?:/.*)?"
          : /^\[\.\.\..+\]$/.test(segment)
            ? "/.+"
            : /^\[.+\]$/.test(segment)
              ? "/[^/]+"
              : segment
                ? `/${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`
                : "",
      )
      .join("");
    compiled.push([new RegExp(`^${source || "/"}$`), chunks]);
  }
  return compiled;
}

export function chunksFor(pathname: string, routes: [RegExp, string[]][]): string[] {
  return routes.find(([pattern]) => pattern.test(pathname))?.[1] ?? [];
}
