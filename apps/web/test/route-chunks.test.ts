import { describe, expect, it } from "bun:test";
import { fetchBuildAsset } from "../src/lib/http";
import {
  buildRouteChunks,
  chunksFor,
  compileRouteChunks,
  routePattern,
} from "../src/lib/route-chunks";

const manifest = (...files: string[]) => ({
  clientModules: { a: { chunks: files.flatMap((file, index) => [String(index), file]) } },
});

describe("route code preloading", () => {
  it("derives URL patterns from page manifests, dropping groups and internals", () => {
    expect(routePattern("/c/[id]/page")).toBe("/c/[id]");
    expect(routePattern("/settings/(editor)/page")).toBe("/settings");
    expect(routePattern("/page")).toBe("/");
    expect(routePattern("/_not-found/page")).toBeNull();
    expect(routePattern("/forms/[action]/route")).toBeNull();
  });
  it("keeps static routes first, drops shared chunks and matches URLs", () => {
    const shared = "static/chunks/layout.js";
    const data = buildRouteChunks({
      "/[handle]/page": manifest(shared, "static/chunks/app/%5Bhandle%5D/page.js"),
      "/about/page": manifest(shared),
      "/c/[id]/page": manifest(shared, "static/chunks/app/c/%5Bid%5D/page.js", "static/x.css"),
      "/c/[id]/edit/page": manifest(shared, "static/chunks/app/c/%5Bid%5D/edit/page.js"),
    });
    const routes = compileRouteChunks(data);
    expect(chunksFor("/about", routes)).toEqual([]);
    expect(chunksFor("/@someone", routes)).toEqual([
      "/_next/static/chunks/app/%5Bhandle%5D/page.js",
    ]);
    expect(chunksFor("/c/0199/edit", routes)).toEqual([
      "/_next/static/chunks/app/c/%5Bid%5D/edit/page.js",
    ]);
    expect(chunksFor("/c/0199", routes)).toEqual(["/_next/static/chunks/app/c/%5Bid%5D/page.js"]);
    expect(chunksFor("/c/0199/missing/deeper", routes)).toEqual([]);
  });
  it("ignores malformed manifests and anything outside build assets", async () => {
    expect(compileRouteChunks(null)).toEqual([]);
    const routes = compileRouteChunks({
      routes: [["/x", ["/_next/static/a.js", "/api/v1/session", "https://evil.example/a.js", 3]]],
    });
    expect(chunksFor("/x", routes)).toEqual(["/_next/static/a.js"]);
    for (const path of ["/api/v1/session", "/c/1", "/_next/static/../../api.js", "//evil/a.js"])
      await expect(fetchBuildAsset(path)).rejects.toThrow("Invalid build asset path");
  });
});
