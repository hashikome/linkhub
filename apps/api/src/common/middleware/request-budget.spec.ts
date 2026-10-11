import { expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import type { PrismaService } from "../../database/prisma.service";
import { requestBudget, requestBudgetKey } from "./request-budget";

it.each([
  "POST",
  "PATCH",
  "DELETE",
  "PUT",
])("attributes %s forms per signed visitor and rejects invalid or read-domain proofs", async (method) => {
  const secret = "test-budget",
    sourceSecret = "test-source",
    keys: string[] = [];
  const prisma = {
    $queryRaw: async (_sql: unknown, key: string) => {
      keys.push(key);
      return [{ count: 1 }];
    },
  } as unknown as PrismaService;
  const middleware = requestBudget(prisma, secret, sourceSecret);
  const sign = (ip: string, domain = "form", issued = Date.now()) => {
    const payload = Buffer.from(JSON.stringify([1, ip, issued])).toString("base64url");
    return `${payload}.${createHmac("sha256", sourceSecret).update(`web-${domain}-source:${payload}`).digest("base64url")}`;
  };
  const proofs = [
    sign("192.0.2.1"),
    sign("192.0.2.2"),
    "invalid",
    sign("192.0.2.1", "read"),
    sign("192.0.2.1", "form", Date.now() - 60000),
  ];
  let passed = 0;
  for (const proof of proofs)
    await middleware(
      {
        method,
        path: "/api/v1/comments/example",
        ip: "127.0.0.1",
        get: (header: string) => (header === "x-web-form-source" ? proof : undefined),
      } as unknown as Request,
      {} as Response,
      () => {
        passed++;
      },
    );
  expect(passed).toBe(5);
  expect(keys).toEqual(
    ["192.0.2.1", "192.0.2.2", "127.0.0.1", "127.0.0.1", "127.0.0.1"].map((ip) =>
      requestBudgetKey("write", ip, secret),
    ),
  );
});

it.each([
  "/api/v1/auth/google-connection",
  "/api/v1/auth/account/recovery",
  "/api/v1/auth/email-registration",
])("attributes %s previews per visitor without weakening callback limits", async (previewPath) => {
  const keys: string[] = [];
  const prisma = {
    $queryRaw: async (_sql: unknown, key: string) => {
      keys.push(key);
      return [{ count: 1 }];
    },
  } as unknown as PrismaService;
  const sign = (source: string) => {
    const payload = Buffer.from(JSON.stringify([1, source, Date.now()])).toString("base64url");
    return `${payload}.${createHmac("sha256", "source").update(`web-read-source:${payload}`).digest("base64url")}`;
  };
  const middleware = requestBudget(prisma, "budget", "source");
  for (const [path, source] of [
    [previewPath, "192.0.2.7"],
    [previewPath, "192.0.2.8"],
    ["/api/v1/auth/callback/google", "192.0.2.7"],
  ])
    await middleware(
      {
        method: "GET",
        path,
        ip: "127.0.0.1",
        get: (name: string) => (name === "x-web-read-source" ? sign(source) : undefined),
      } as unknown as Request,
      {} as Response,
      () => {},
    );
  expect(keys).toEqual([
    requestBudgetKey("read", "192.0.2.7", "budget"),
    requestBudgetKey("read", "192.0.2.8", "budget"),
    requestBudgetKey("auth", "127.0.0.1", "budget"),
  ]);
});

it("keeps import polling and draft edits outside the upload budget", async () => {
  const keys: string[] = [];
  const prisma = {
    $queryRaw: async (_sql: unknown, key: string) => {
      keys.push(key);
      return [{ count: 1 }];
    },
  } as unknown as PrismaService;
  const middleware = requestBudget(prisma, "budget");
  for (const [method, path] of [
    ["POST", "/API/V1/IMPORTS/"],
    ["GET", "/api/v1/imports"],
    ["GET", "/api/v1/imports/id/rows"],
    ["PATCH", "/api/v1/imports/id"],
    ["POST", "/api/v1/imports/id/commit"],
  ]) {
    await middleware(
      { method, path, ip: "192.0.2.1", get: () => undefined } as unknown as Request,
      {} as Response,
      () => {},
    );
  }
  expect(keys).toEqual(
    ["file", "read", "read", "write", "write"].map((scope) =>
      requestBudgetKey(scope, "192.0.2.1", "budget"),
    ),
  );
});
