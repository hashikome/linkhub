import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import {
  applyEdgeCachePolicy,
  edgeCacheable,
  PUBLIC_EDGE_POLICY,
  publicPagePath,
} from "../server/edge-cache";
import { markEdgeUncacheable, runEdgeCacheScope } from "../src/lib/edge-cache-scope";

const id = "0199c3f2-7b1a-7c3d-8e4f-0123456789ab";

describe("edge cache eligibility", () => {
  it("never treats a top-level static route as a public profile", () => {
    const routes = readdirSync(join(import.meta.dir, "../src/app"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !/^[[(]/.test(entry.name))
      .map((entry) => entry.name);
    expect(routes.length).toBeGreaterThan(10);
    for (const route of routes)
      expect(publicPagePath(`/${route}`)).toBe(route === "about" || route === "discover");
  });
  it("allows only signed-out public page documents", () => {
    for (const path of [
      "/",
      "/about",
      "/discover",
      `/c/${id}`,
      `/h/${id}`,
      `/people/${id}`,
      "/@my-hub",
      "/%40my-hub",
      "/someone",
      `/c/${id}?item=${id}&cursor=x`,
    ])
      expect(edgeCacheable("GET", path, {})).toBe(true);
    for (const path of [
      `/c/${id}?s=token`,
      `/h/${id}?view=public`,
      `/c/${id}?_rsc=abc`,
      `/c/${id}?other=1`,
      `/c/${id}/edit`,
      "/c/not-a-uuid",
      "/capture",
      "/settings",
      "/manage/collections",
      "/sign-in",
      "/forms/theme",
      "//evil.example/",
      "/@x",
      "/Someone",
    ])
      expect(edgeCacheable("GET", path, {})).toBe(false);
    expect(edgeCacheable("POST", "/", {})).toBe(false);
    expect(edgeCacheable("HEAD", "/", {})).toBe(true);
    for (const headers of [
      { authorization: "Bearer x" },
      { rsc: "1" },
      { "next-router-prefetch": "1" },
      { "next-router-state-tree": "x" },
      { "next-action": "x" },
    ])
      expect(edgeCacheable("GET", "/", headers)).toBe(false);
    expect(edgeCacheable("GET", "/", { cookie: "__cf_bm=a; cf_clearance=b; _cfuvid=c" })).toBe(
      true,
    );
    for (const cookie of [
      "better-auth.session_token=x",
      "__Secure-better-auth.session_token=x",
      "appearance=dark",
      "resource_same_tab=on",
      "sign_in_flow=x",
      "__cf_bm=a; anything=b",
    ])
      expect(edgeCacheable("GET", "/", { cookie })).toBe(false);
  });
});

describe("edge cache response policy", () => {
  async function served(
    path: string,
    respond: (response: import("node:http").ServerResponse) => void,
    headers: Record<string, string> = {},
  ) {
    const server = createServer((request, response) => {
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      applyEdgeCachePolicy(request, response);
      respond(response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
      await response.text();
      return response.headers.get("cache-control");
    } finally {
      server.close();
    }
  }
  const html = (response: import("node:http").ServerResponse) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.write("<!doctype html>");
    response.end("<p>public</p>");
  };
  it("marks streamed and explicit HTML 200 responses public", async () => {
    expect(await served("/about", html)).toBe(PUBLIC_EDGE_POLICY);
    expect(
      await served("/discover", (response) => {
        response.writeHead(200, {
          "content-type": "text/html",
          "cache-control": "private, no-store",
        });
        response.end("ok");
      }),
    ).toBe(PUBLIC_EDGE_POLICY);
  });
  it("keeps cookies, errors, other types and ineligible requests private", async () => {
    const privatePolicy = "private, no-store, max-age=0";
    expect(
      await served("/about", (response) => {
        response.setHeader("Set-Cookie", "flow=x");
        html(response);
      }),
    ).toBe(privatePolicy);
    expect(
      await served("/about", (response) => {
        response.statusCode = 404;
        html(response);
      }),
    ).toBe(privatePolicy);
    expect(
      await served("/about", (response) => {
        response.setHeader("Content-Type", "text/x-component");
        response.end("0:{}");
      }),
    ).toBe(privatePolicy);
    expect(await served("/about", html, { cookie: "better-auth.session_token=x" })).toBe(
      privatePolicy,
    );
    expect(await served("/settings", html)).toBe(privatePolicy);
  });
  it("keeps a render private once any API call failed or wrote", async () => {
    const server = createServer((request, response) => {
      const scope = { cacheable: true };
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      applyEdgeCachePolicy(request, response, scope);
      void runEdgeCacheScope(scope, async () => {
        await Promise.resolve();
        if (request.url === "/about?notice=failed") markEdgeUncacheable();
        html(response);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    try {
      const policy = async (path: string) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        await response.text();
        return response.headers.get("cache-control");
      };
      expect(await policy("/about?notice=failed")).toBe("private, no-store, max-age=0");
      expect(await policy("/about")).toBe(PUBLIC_EDGE_POLICY);
    } finally {
      server.close();
    }
  });
});
