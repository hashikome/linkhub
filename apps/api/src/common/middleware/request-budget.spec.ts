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
