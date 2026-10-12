import { describe, expect, it } from "bun:test";
import { webServerConfig } from "@ntumie/config/web-server";
import {
  permalink,
  postJson,
  readJson,
  routeHandle,
  routeSegment,
  safePath,
  safeReturn,
  sessionCookie,
  submitForm,
} from "../src/lib/http";

describe("web HTTP boundary", () => {
  it("preserves validated section editing destinations through sign-in", () => {
    const id = "019a0000-0000-7000-8000-000000000001";
    const base = `/c/${id}/sections`;
    expect(safeReturn(base)).toBe(base);
    expect(safeReturn(`${base}?section=${id}&unexpected=value`)).toBe(`${base}?section=${id}`);
    expect(safeReturn(`${base}?section=bad-id`)).toBe(base);
  });
  it("preserves item destinations through sign-in without accepting arbitrary item values", () => {
    const id = "019a0000-0000-7000-8000-000000000001";
    for (const base of [`/c/${id}`]) {
      const destination = `${base}?s=token&item=${id}`;
      expect(safeReturn(destination)).toBe(destination);
      expect(safeReturn(`${base}?item=bad-id`)).toBe(base);
    }
  });
  it("submits native form enhancements with bounded same-origin requests and safe errors", async () => {
    const body = new URLSearchParams({ displayName: "Draft" });
    const success = await submitForm("/forms/profile-save", body, (async (
      url: string | URL | Request,
      options?: RequestInit,
    ) => {
      expect(url).toBe("/forms/profile-save");
      expect(options?.credentials).toBe("same-origin");
      expect(options?.redirect).toBe("error");
      expect(options?.cache).toBe("no-store");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(options?.body).toBe(body);
      return Response.json({ ok: true, data: { displayName: "Draft" } });
    }) as unknown as typeof fetch);
    expect(success).toEqual({ ok: true, data: { displayName: "Draft" } });
    const failed = await submitForm("/forms/profile-save", body, (async () =>
      Response.json(
        { ok: false, code: "handle_unavailable" },
        { status: 400 },
      )) as unknown as typeof fetch);
    expect(failed).toMatchObject({ ok: false, code: "handle_unavailable", status: 400 });
    const malformed = await submitForm(
      "/forms/profile-save",
      body,
      (async () => new Response("sign-in HTML")) as unknown as typeof fetch,
    );
    expect(malformed.ok).toBe(false);
    await expect(submitForm("/forms/../../external", body)).rejects.toThrow("Invalid form path");
  });
  it("decodes literal hub prefixes once without accepting encoded separators or unrelated routes", () => {
    expect(routeHandle(routeSegment("%40reader"))).toBe("reader");
    expect(routeHandle(routeSegment("@reader"))).toBe("reader");
    for (const segment of [
      "reader",
      "%2540reader",
      "%40reader%2Fother",
      "%40reader%5Cother",
      "%40ab",
      "%",
    ]) {
      expect(routeHandle(routeSegment(segment))).toBeUndefined();
    }
  });
  it("only forwards session cookies and keeps shared links explicit", () => {
    expect(sessionCookie("other=secret; better-auth.session_token=proof; tracking=secret")).toBe(
      "better-auth.session_token=proof",
    );
    expect(permalink("id")).toBe("/c/id");
    expect(permalink("id", "a&b")).toBe("/c/id?s=a%26b");
  });
  it("refuses upstream URL injection and invalid production origins", () => {
    for (const path of ["//evil.test/api/v1/a", "/api/v1/../../evil", "/api/v1/a\\b"])
      expect(() => safePath(path as `/api/v1/${string}`)).toThrow();
    for (const origin of [
      "https://secret@example.com",
      "https://fixture-links.dev/path",
      "file:///etc/passwd",
    ])
      expect(() => webServerConfig({ API_INTERNAL_ORIGIN: origin })).toThrow();
    expect(() => webServerConfig({ NODE_ENV: "production" })).toThrow();
  });
  it("bounds body reads, refuses redirects and never reflects remote errors", async () => {
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/redirect") return Response.redirect("https://fixture-links.dev");
        if (path === "/slow")
          return new Response(
            new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode('{"data":'));
              },
              cancel() {},
            }),
            { headers: { "content-type": "application/json" } },
          );
        return Response.json(
          { error: { code: "made_up", message: "SECRET" } },
          { status: 429, headers: { "Retry-After": "2" } },
        );
      },
    });
    try {
      expect(await readJson(`${server.url}slow`, { timeout: 50 })).toMatchObject({
        ok: false,
        code: "request_timeout",
      });
      expect(await readJson(`${server.url}redirect`, { timeout: 500 })).toMatchObject({
        ok: false,
      });
      const failure = await readJson(`${server.url}error`, { timeout: 500 });
      expect(failure).toMatchObject({ ok: false, code: "unavailable", retryAfter: 2 });
      expect(JSON.stringify(failure)).not.toContain("SECRET");
    } finally {
      await server.stop(true);
    }
  });
});

it("restricts post-login returns to local documents without authentication loops", async () => {
  const { safeReturn, safeDocumentReturn } = await import("../src/lib/http");
  for (const input of [
    "https://evil.test/",
    "//evil.test/",
    "/\\evil.test/",
    "/%2f%2fevil.test/",
    "/sign-in?returnTo=/manage",
    "/forms/operation",
    "/\n/evil.test/",
    "/@reader//evil.test",
    "/@reader/%2fexample",
  ])
    expect(safeReturn(input)).toBe("/");
  expect(safeDocumentReturn("/sign-in/code?notice=sent")).toBe("/sign-in/code?notice=sent");
  expect(safeDocumentReturn("//evil.test")).toBe("/");
  expect(safeDocumentReturn("/forms/theme")).toBe("/");
  expect(safeReturn("/manage/accounts/019f0000-0000-7000-8000-000000000001")).toBe(
    "/manage/accounts/019f0000-0000-7000-8000-000000000001",
  );
  expect(safeReturn("/c/019f0000-0000-7000-8000-000000000001")).toBe(
    "/c/019f0000-0000-7000-8000-000000000001",
  );
  expect(
    safeReturn("/c/01990000-0000-7000-8000-000000000001?s=abc_123&returnTo=https://evil.test"),
  ).toBe("/c/01990000-0000-7000-8000-000000000001?s=abc_123");
  expect(safeReturn("/c/01990000-0000-7000-8000-000000000001?s=bad%26token")).toBe(
    "/c/01990000-0000-7000-8000-000000000001",
  );
  const tracked =
    "/c/019f0000-0000-7000-8000-000000000001?via=019f0000-0000-7000-8000-000000000002";
  expect(safeReturn(`${tracked}&next=https://evil.test`)).toBe(tracked);
  expect(safeReturn(safeReturn(tracked))).toBe(tracked);
  expect(safeReturn("/c/01990000-0000-7000-8000-000000000001?via=invalid")).toBe(
    "/c/01990000-0000-7000-8000-000000000001",
  );
  expect(
    safeReturn(
      "/c/01990000-0000-7000-8000-000000000001?s=abc_123&compose=comment&next=https://evil.test",
    ),
  ).toBe("/c/01990000-0000-7000-8000-000000000001?s=abc_123&compose=comment#comment-composer");
  expect(safeReturn("/c/01990000-0000-7000-8000-000000000001?compose=anything#other")).toBe(
    "/c/01990000-0000-7000-8000-000000000001",
  );
  expect(safeReturn(safeReturn("/c/01990000-0000-7000-8000-000000000001?compose=comment"))).toBe(
    "/c/01990000-0000-7000-8000-000000000001?compose=comment#comment-composer",
  );
  for (const origin of [
    "https://secret@example.test",
    "https://example.test/path",
    "file:///tmp/test",
  ])
    expect(() =>
      webServerConfig({ WEB_SOURCE_SECRET: "s".repeat(32), BETTER_AUTH_URL: origin }),
    ).toThrow();
});

it("drops retired Manage scopes from sign-in returns", async () => {
  const { safeReturn } = await import("../src/lib/http");
  expect(safeReturn("/manage/collections?scope=hub&hubId=someone-else")).toBe(
    "/manage/collections",
  );
  expect(safeReturn("/manage/audit?scope=hub")).toBe("/manage/audit");
  expect(safeReturn("/manage/team?scope=hub")).toBe("/manage/team");
});

it("keeps only recognized Settings sections in sign-in return paths", async () => {
  const { safeReturn } = await import("../src/lib/http");
  expect(safeReturn("/settings?section=hub&next=https://evil.test")).toBe("/settings?section=hub");
  expect(safeReturn("/settings?section=notifications")).toBe("/settings?section=notifications");
  expect(safeReturn("/settings?section=device&next=https://evil.test")).toBe(
    "/settings?section=device",
  );
  expect(safeReturn("/settings?section=unknown")).toBe("/settings");
  expect(safeReturn("/manage/analytics?scope=service")).toBe("/manage/analytics");
});

it("preserves validated sharing tasks through sign-in without external returns", async () => {
  const { safeReturn } = await import("../src/lib/http");
  const id = "019f0000-0000-7000-8000-000000000001";
  for (const kind of ["site", "profile", "hub", "collection"]) {
    const query = new URLSearchParams({ kind });
    if (kind !== "site") query.set("id", id);
    if (kind === "collection") query.set("s", "secret_123");
    query.set("returnTo", `/c/${id}?item=${id}`);
    const path = `/share?${query}`;
    expect(safeReturn(path)).toBe(path);
    expect(safeReturn(safeReturn(path))).toBe(path);
    expect(safeReturn(`${path}&next=https://evil.test`)).toBe(path);
  }
  for (const path of [
    "/share",
    "/share?kind=wrong",
    "/share?kind=collection",
    "/share?kind=hub&id=invalid",
    `/share?kind=site&id=${id}`,
    `/share?kind=collection&id=${id}&id=${id}`,
    "/share?kind=site&kind=hub",
  ])
    expect(safeReturn(path)).toBe("/");
  const query = new URLSearchParams({
    kind: "collection",
    id,
    s: "bad&token",
    returnTo: "//evil.test",
  });
  expect(safeReturn(`/share?${query}`)).toBe(`/share?kind=collection&id=${id}&returnTo=%2F`);
});

it("separates public backend callbacks from web destinations and private transport", () => {
  const config = webServerConfig({
    BETTER_AUTH_URL: "http://localhost:4004",
    WEB_ORIGIN: "http://localhost:3004",
    API_INTERNAL_ORIGIN: "http://127.0.0.1:4004",
    WEB_SOURCE_SECRET: "s".repeat(32),
  });
  expect(config.authOrigin).toBe("http://localhost:4004");
  expect(config.publicOrigin).toBe("http://localhost:3004");
  expect(config.apiOrigin).toBe("http://127.0.0.1:4004");
  for (const web of [
    "http://foreign.test",
    "https://localhost:3004",
    "http://localhost:3004/path",
    "null",
  ])
    expect(() => webServerConfig({ WEB_ORIGIN: web, WEB_SOURCE_SECRET: "s".repeat(32) })).toThrow();
});

it("defaults local origins to allocated host ports and retains explicit container origins", () => {
  const local = webServerConfig({ WEB_SOURCE_SECRET: "s".repeat(32) });
  expect(local.authOrigin).toBe("http://localhost:4004");
  expect(local.publicOrigin).toBe("http://localhost:3004");
  expect(local.apiOrigin).toBe("http://127.0.0.1:4004");
  const production = webServerConfig({
    NODE_ENV: "production",
    BETTER_AUTH_URL: "https://app.example.org",
    API_INTERNAL_ORIGIN: "http://api:4000",
    WEB_SOURCE_SECRET: "s".repeat(32),
  });
  expect(production.authOrigin).toBe("https://app.example.org");
  expect(production.publicOrigin).toBe("https://app.example.org");
  expect(production.apiOrigin).toBe("http://api:4000");
});

it("forwards proof cancellation on failed code issuance without forwarding session cookies", async () => {
  const original = globalThis.fetch;
  const clear = "better-auth.google_connection=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  const clearRegistration =
    "better-auth.email_registration=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  globalThis.fetch = (async () =>
    Response.json(
      { error: { code: "too_many_requests" } },
      {
        status: 429,
        headers: [
          ["Retry-After", "30"],
          ["Set-Cookie", clear],
          ["Set-Cookie", clearRegistration],
          ["Set-Cookie", "better-auth.session_token=must-not-forward; Path=/"],
        ],
      },
    )) as unknown as typeof fetch;
  try {
    const response = await postJson(
      "http://fixture.test/api/v1/auth/code/send",
      {},
      { headers: new Headers(), raw: true },
    );
    expect(response).toMatchObject({
      ok: false,
      status: 429,
      retryAfter: 30,
      setCookies: [clear, clearRegistration],
    });
  } finally {
    globalThis.fetch = original;
  }
});

it("preserves import return paths and explicitly transmits revision-bearing deletes and multipart uploads", async () => {
  const path = "/manage/import-export/019f0000-0000-7000-8000-000000000001";
  expect(safeReturn(`${path}?unexpected=value`)).toBe(path);
  expect(safeReturn("/manage/import-export")).toBe("/manage/import-export");
  expect(safeReturn("/manage/import-export?tab=review&next=https://evil.test")).toBe(
    "/manage/import-export?tab=review",
  );
  const original = globalThis.fetch;
  const sent: RequestInit[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(init ?? {});
    return Response.json({ data: { success: true } });
  }) as unknown as typeof fetch;
  try {
    await postJson(
      "http://fixture.test/api/v1/imports/id",
      { version: 3 },
      { headers: new Headers(), method: "DELETE", deleteBody: true },
    );
    expect(sent[0].body).toBe('{"version":3}');
    await postJson(
      "http://fixture.test/api/v1/existing-delete",
      {},
      { headers: new Headers(), method: "DELETE" },
    );
    expect(sent[1].body).toBeUndefined();
    const file = new FormData();
    file.set("sourceKind", "csv");
    file.set("file", new Blob(["url\nhttps://example.com"]), "links.csv");
    await postJson("http://fixture.test/api/v1/imports", file, { headers: new Headers() });
    expect(sent[2].body).toBe(file);
    expect(sent.every((init) => init.cache === "no-store" && init.redirect === "error")).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

it("preserves safe import row editor returns through sign-in", () => {
  const path =
    "/manage/import-export/019f0000-0000-7000-8000-000000000001/rows/019f0000-0000-7000-8000-000000000002";
  expect(safeReturn(path)).toBe(path);
  expect(safeReturn(`${path}?next=https://evil.test`)).toBe(path);
  expect(safeReturn(`${path}/unexpected`)).toBe("/");
});

it("preserves only valid inline import correction and status parameters", () => {
  const path = "/manage/import-export/019f0000-0000-7000-8000-000000000001";
  const id = "019f0000-0000-7000-8000-000000000002";
  expect(safeReturn(`${path}?edit=${id}&status=failed&next=https://evil.test`)).toBe(
    `${path}?status=failed&edit=${id}`,
  );
  expect(safeReturn(`${path}?edit=invalid&status=unknown`)).toBe(path);
  expect(safeReturn(`${path}?collection=${id}&status=failed&edit=${id}`)).toBe(
    `${path}?collection=${id}&status=failed&edit=${id}`,
  );
  expect(safeReturn(`${path}?collection=invalid`)).toBe(path);
});
