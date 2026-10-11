import { afterAll, describe, expect, it } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDeliveryAuth } from "../src/auth/delivery-auth";
import type { PrismaService } from "../src/database/prisma.service";
import { emailKey, unseal } from "../src/email/outbox";
import { PrismaClient } from "../src/generated/prisma/client";
import { CollectionPolicyService } from "../src/modules/hubs/collection-policy.service";
import { expectSignIns } from "./fixtures/authentication-audit";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const secret = "account-test-secret-long-enough-for-auth";
const suppressionSecret = "account-test-suppression-secret";
const config = {
  prisma,
  secret,
  suppressionSecret,
  baseURL: "http://localhost:4004",
  supportUrl: "https://fixture-links.dev/support",
  codeResendSeconds: 0,
};
const auth = createDeliveryAuth(config);
function call(path: string, body: object, token?: string, instance = auth) {
  return instance.handler(
    new Request(`http://localhost:4004/api/v1/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: config.baseURL,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
async function code(email: string) {
  const row = await prisma.emailOutbox.findFirstOrThrow({
    where: { recipientKey: emailKey(suppressionSecret, "recipient", email), state: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return unseal(row.payload ?? "", secret).text.match(/^\d{8}$/m)?.[0] ?? "";
}
async function signup() {
  const email = `account-${crypto.randomUUID()}@example.com`;
  expect((await call("/code/send", { email })).status).toBe(200);
  const login = await call("/code/verify", { email, code: await code(email), createAccount: true });
  expect(login.status).toBe(200);
  return {
    email,
    token: login.headers.get("set-auth-token") ?? "",
    id: (await login.json()).user.id as string,
  };
}
async function perform(action: string, person: Awaited<ReturnType<typeof signup>>, token?: string) {
  expect((await call("/account/send", { action, email: person.email }, token)).status).toBe(200);
  return call(
    "/account/confirm",
    { action, email: person.email, code: await code(person.email) },
    token,
  );
}
afterAll(() => prisma.$disconnect());

describe("self-service account lifecycle", () => {
  it("revokes sessions, hides owned collections from everyone and restores access without old sessions", async () => {
    const owner = await signup(),
      reader = await signup();
    const hub = await prisma.hub.create({
      data: { ownerUserId: owner.id, handle: `lifecycle-${crypto.randomUUID().slice(0, 8)}` },
    });
    const collection = await prisma.collection.create({
      data: { hubId: hub.id, title: "Lifecycle", slug: "lifecycle", published: true },
    });
    await prisma.collectionShare.create({
      data: {
        collectionId: collection.id,
        userId: reader.id,
        role: "contributor",
        source: "direct",
      },
    });
    const policy = new CollectionPolicyService(prisma as unknown as PrismaService);
    expect((await policy.resolve(collection, { userId: reader.id })).canWriteContent).toBe(true);
    const response = await perform("deactivate", owner, owner.token);
    expect(response.status).toBe(200);
    expect(response.headers.has("set-auth-token")).toBe(false);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
    expect((await policy.resolve(collection, null)).canRead).toBe(false);
    expect((await policy.resolve(collection, { userId: reader.id })).canRead).toBe(false);
    expect((await perform("reactivate", owner)).status).toBe(200);
    await expectSignIns(prisma, owner.id, ["email"]);
    expect((await policy.resolve(collection, { userId: reader.id })).canWriteContent).toBe(true);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
    expect(
      await auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
      }),
    ).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          targetUserId: owner.id,
          actorUserId: owner.id,
          category: "operation",
          outcome: "success",
        },
      }),
    ).toBe(2);
  });

  it("binds codes to action and session, commits wrong attempts, and rejects replay", async () => {
    const owner = await signup();
    await call("/code/send", { email: owner.email });
    const ordinary = await code(owner.email);
    await call("/account/send", { action: "deactivate" }, owner.token);
    const proof = await code(owner.email);
    expect(
      (await call("/account/confirm", { action: "deactivate", code: ordinary }, owner.token))
        .status,
    ).toBe(400);
    expect(
      (await call("/account/confirm", { action: "delete", code: proof }, owner.token)).status,
    ).toBe(400);
    const secondLogin = await call("/code/verify", { email: owner.email, code: ordinary });
    expect(secondLogin.status).toBe(200);
    expect(
      (
        await call(
          "/account/confirm",
          { action: "deactivate", code: proof },
          secondLogin.headers.get("set-auth-token") ?? "",
        )
      ).status,
    ).toBe(400);
    expect(
      (await call("/account/confirm", { action: "deactivate", code: proof }, owner.token)).status,
    ).toBe(200);
    expect(
      (await call("/account/confirm", { action: "deactivate", code: proof }, owner.token)).status,
    ).toBe(401);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).deletionScheduledFor,
    ).toBeNull();
  });

  it("never lets self-service lift an operator restriction or act on another account", async () => {
    const owner = await signup(),
      stranger = await signup();
    await perform("deactivate", owner, owner.token);
    await call("/account/send", { action: "reactivate", email: owner.email });
    const proof = await code(owner.email);
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        accountState: "suspended",
        selfDeactivated: false,
        operationsVersion: { increment: 1 },
      },
    });
    expect(
      (await call("/account/confirm", { action: "reactivate", email: owner.email, code: proof }))
        .status,
    ).toBe(400);
    expect(
      (await call("/account/send", { action: "reactivate", email: owner.email }, stranger.token))
        .status,
    ).toBe(403);
    await prisma.user.update({ where: { id: owner.id }, data: { accountState: "inactive" } });
    expect(
      (await call("/account/confirm", { action: "reactivate", email: owner.email, code: proof }))
        .status,
    ).toBe(400);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
  });

  it("separates deletion cancellation from reactivation and respects the deadline", async () => {
    const owner = await signup();
    expect((await perform("delete", owner, owner.token)).status).toBe(200);
    const pending = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(pending.deletionScheduledFor?.getTime()).toBeGreaterThan(Date.now() + 13 * 86400000);
    await call("/account/send", { action: "cancel_deletion", email: owner.email });
    const proof = await code(owner.email);
    expect(
      (await call("/account/confirm", { action: "reactivate", email: owner.email, code: proof }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("/account/confirm", {
          action: "cancel_deletion",
          email: owner.email,
          code: proof,
        })
      ).status,
    ).toBe(200);
    const cancelled = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(cancelled.accountState).toBe("inactive");
    expect(cancelled.deletionScheduledFor).toBeNull();
    expect(cancelled.selfDeactivated).toBe(true);
    await prisma.user.update({
      where: { id: owner.id },
      data: { deletionScheduledFor: new Date(Date.now() - 1) },
    });
    expect(
      (
        await call("/account/confirm", {
          action: "cancel_deletion",
          email: owner.email,
          code: proof,
        })
      ).status,
    ).toBe(400);
  });

  it("rolls back completed proofs, sessions and lifecycle changes on commit failure", async () => {
    const owner = await signup();
    await call("/account/send", { action: "deactivate" }, owner.token);
    const proof = await code(owner.email);
    const failing = createDeliveryAuth({
      ...config,
      beforeCommit: async () => {
        throw new Error("fixture failure");
      },
    });
    expect(
      (await call("/account/confirm", { action: "deactivate", code: proof }, owner.token, failing))
        .status,
    ).toBe(503);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).accountState).toBe(
      "active",
    );
    expect(
      (await call("/account/confirm", { action: "deactivate", code: proof }, owner.token)).status,
    ).toBe(200);
  });
});

it("discovers only the eligible recovery action after sign-in email proof, without a session", async () => {
  const cookieOf = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const recover = (cookie: string, path = "/account/recovery", body?: object, instance = auth) =>
    instance.handler(
      new Request(`${config.baseURL}/api/v1/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: { origin: config.baseURL, cookie, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  expect((await recover("")).status).toBe(404);
  for (const action of ["reactivate", "cancel_deletion"] as const) {
    const owner = await signup();
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        accountState: "inactive",
        selfDeactivated: true,
        operationsVersion: { increment: 1 },
        deletionScheduledFor: action === "cancel_deletion" ? new Date(Date.now() + 86400000) : null,
      },
    });
    await prisma.session.deleteMany({ where: { userId: owner.id } });
    const sent = await call("/code/send", { email: owner.email });
    expect(sent.status).toBe(200);
    expect(await sent.json()).toEqual({ success: true });
    expect((await call("/code/verify", { email: owner.email, code: "00000000" })).status).toBe(400);
    const proof = await code(owner.email);
    const broken = createDeliveryAuth({
      ...config,
      beforeCommit: async () => {
        throw new Error("recovery rollback");
      },
    });
    const failed = await call(
      "/code/verify",
      { email: owner.email, code: proof },
      undefined,
      broken,
    );
    expect(failed.status).toBe(503);
    expect(failed.headers.has("set-cookie")).toBe(false);
    const verified = await call("/code/verify", { email: owner.email, code: proof });
    expect(await verified.json()).toEqual({ accountRecovery: true });
    expect(verified.headers.has("set-auth-token")).toBe(false);
    expect(cookieOf(verified)).not.toContain("session_token");
    await expectSignIns(prisma, owner.id, ["email"]);
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
    const cookie = cookieOf(verified);
    const preview = await recover(cookie);
    expect((await preview.json()).data).toMatchObject({ action, email: owner.email });
    expect(
      (await recover(cookie, "/account/recovery/confirm", { confirm: true, action: "delete" }))
        .status,
    ).toBe(400);
    expect(
      (await recover(cookie, "/account/recovery/confirm", { confirm: true }, broken)).status,
    ).toBe(503);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).accountState).toBe(
      "inactive",
    );
    const confirmed = await recover(cookie, "/account/recovery/confirm", { confirm: true });
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).action).toBe(action);
    expect(confirmed.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await recover(cookie, "/account/recovery/confirm", { confirm: true })).status).toBe(
      404,
    );
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(saved.accountState).toBe(action === "reactivate" ? "active" : "inactive");
    expect(saved.deletionScheduledFor).toBeNull();
    expect(await prisma.session.count({ where: { userId: owner.id } })).toBe(0);
  }
  for (const invalidation of ["expired", "restricted", "changed"]) {
    const owner = await signup();
    await prisma.user.update({
      where: { id: owner.id },
      data: { accountState: "inactive", selfDeactivated: true },
    });
    await prisma.session.deleteMany({ where: { userId: owner.id } });
    await call("/code/send", { email: owner.email });
    const proof = await call("/code/verify", { email: owner.email, code: await code(owner.email) });
    const cookie = cookieOf(proof);
    if (invalidation === "expired")
      await prisma.verification.updateMany({
        where: { identifier: { startsWith: `account-action:${owner.id}:recovery:` } },
        data: { expiresAt: new Date(0) },
      });
    else
      await prisma.user.update({
        where: { id: owner.id },
        data:
          invalidation === "restricted"
            ? { selfDeactivated: false }
            : { operationsVersion: { increment: 1 } },
      });
    expect((await recover(cookie)).status).toBe(404);
    expect((await recover(cookie, "/account/recovery/confirm", { confirm: true })).status).toBe(
      404,
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).accountState).toBe(
      "inactive",
    );
  }
  for (const state of ["restricted", "overdue"]) {
    const owner = await signup();
    await prisma.user.update({
      where: { id: owner.id },
      data: {
        accountState: "inactive",
        selfDeactivated: state !== "restricted",
        deletionScheduledFor: state === "overdue" ? new Date(0) : null,
      },
    });
    const before = await prisma.emailOutbox.count();
    expect((await call("/code/send", { email: owner.email })).status).toBe(200);
    expect(await prisma.emailOutbox.count()).toBe(before);
    expect((await call("/code/verify", { email: owner.email, code: "00000000" })).status).toBe(400);
  }
});
