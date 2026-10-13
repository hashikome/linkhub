// Post-build: write route → chunk URLs for intent-based code preloading.
// Served from /_next/static (immutable) under the build ID.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { buildRouteChunks } from "../src/lib/route-chunks";

const next = join(import.meta.dir, "../.next");
const manifests: Record<string, never> = {};
function collect(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name === "page_client-reference-manifest.js") {
      // The manifest assigns to globalThis, which is the context object here.
      const context: { __RSC_MANIFEST?: Record<string, never> } = {};
      runInNewContext(readFileSync(path, "utf8"), context);
      Object.assign(manifests, context.__RSC_MANIFEST);
    }
  }
}
collect(join(next, "server/app"));
const data = buildRouteChunks(manifests);
if (!data.routes.length) throw new Error("No route chunks found in the Next build");
const buildId = readFileSync(join(next, "BUILD_ID"), "utf8").trim();
mkdirSync(join(next, "static/route-chunks"), { recursive: true });
writeFileSync(join(next, `static/route-chunks/${buildId}.json`), JSON.stringify(data));
console.log(`Route chunks: ${data.routes.length} routes`);
