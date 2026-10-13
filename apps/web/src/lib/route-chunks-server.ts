import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null | undefined;
// The post-build manifest for this build, or null (development, missing file).
export function routeChunksUrl(): string | null {
  if (cached !== undefined) return cached;
  try {
    const next = join(process.cwd(), ".next");
    const buildId = readFileSync(join(next, "BUILD_ID"), "utf8").trim();
    cached =
      /^[\w-]+$/.test(buildId) && existsSync(join(next, `static/route-chunks/${buildId}.json`))
        ? `/_next/static/route-chunks/${buildId}.json`
        : null;
  } catch {
    cached = null;
  }
  return cached;
}
