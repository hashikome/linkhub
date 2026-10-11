import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { OperationAction } from "@linkhub/types";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { RequestBudgetMaintenance } from "../src/common/request-budget-maintenance";
import { readSecret } from "../src/config/secret";
import { PrismaService } from "../src/database/prisma.service";
import { emailConfig } from "../src/email/config";
import { emailKey, unseal } from "../src/email/outbox";
import { pruneDeletedAccounts } from "../src/operations/account-deletion";
import { changeOperatorGrant } from "./fixtures/operator";
import { signInWithCode } from "./fixtures/sign-in";

describe("service operator authority (HTTP)", () => {
  let app: INestApplication, prisma: PrismaService;
  type Actor = { id: string; cookie: string; token: string; email: string };
  let operator: Actor, owner: Actor, reader: Actor;
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:4000";
  const server = () => app.getHttpServer();
  async function login(name: string): Promise<Actor> {
    const email = `ops-${name}-${randomUUID()}@example.com`;
    const response = await signInWithCode(server(), { email, name });
    return {
      id: response.body.user.id,
      email,
      token: response.headers["set-auth-token"],
      cookie: (response.headers["set-cookie"] as unknown as string[])
        .map((c: string) => c.split(";")[0])
        .join("; "),
    };
  }
  const as = (method: "get" | "post" | "patch" | "delete", path: string, actor = operator) =>
    request(server())[method](path).set("Cookie", actor.cookie).set("Origin", origin);
  async function create(published = true) {
    const r = await as("post", "/api/v1/collections", owner)
      .send({ slug: `ops-${randomUUID()}`, title: "Operator public fixture", published })
      .expect(201);
    return r.body.data;
  }
  function command(
    action: OperationAction,
    targetId: string,
    version: number,
    extra: Record<string, unknown> = {},
    actor = operator,
  ) {
    const reason =
      action.endsWith("reactivate") || action.endsWith("release")
        ? "review_completed"
        : action === "sessions.revoke"
          ? "account_compromise"
          : "spam";
    return as("post", "/api/v1/operations/commands", actor).send({
      action,
      targetId,
      version,
      reason,
      operationId: randomUUID(),
      ...extra,
    });
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    operator = await login("operator");
    await prisma.adminGrant.create({ data: { userId: operator.id, invitationId: randomUUID() } });
    owner = await login("owner");
    reader = await login("reader");
    await changeOperatorGrant(prisma, {
      userId: operator.id,
      grant: true,
      authority: "test-deployment",
      version: 1,
    });
  });
  beforeEach(async () => {
    await prisma.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app?.close();
  });

  it("pages managed collections across submillisecond and identical creation timestamps", async () => {
    const actor = await login("collection-cursor");
    const ids: string[] = [];
    for (const timestamp of [
      "2026-01-01T00:00:00.123900Z",
      "2026-01-01T00:00:00.123800Z",
      "2026-01-01T00:00:00.123800Z",
    ]) {
      const created = await as("post", "/api/v1/collections", actor)
        .send({ slug: `cursor-${randomUUID()}`, title: "Cursor fixture" })
        .expect(201);
      ids.push(created.body.data.id);
      await prisma.$executeRaw`UPDATE collections SET created_at = ${timestamp}::timestamptz
        WHERE id = ${created.body.data.id}::uuid`;
    }
    const expected = [ids[0], ...ids.slice(1).sort().reverse()];
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await as("get", "/api/v1/manage/collections", actor)
        .query({ limit: 1, ...(cursor ? { cursor } : {}) })
        .expect(200);
      seen.push(...page.body.data.map((row: { id: string }) => row.id));
      cursor = page.body.meta.nextCursor;
      expect(seen.length).toBeLessThanOrEqual(expected.length);
    } while (cursor);
    expect(seen).toEqual(expected);
    const first = await as("get", "/api/v1/manage/collections", actor)
      .query({ limit: 1 })
      .expect(200);
    await as("delete", `/api/v1/collections/${expected[0]}`, actor).expect(200);
    const stale = await as("get", "/api/v1/manage/collections", actor)
      .query({ limit: 1, cursor: first.body.meta.nextCursor })
      .expect(400);
    expect(stale.body.error.code).toBe("invalid_cursor");
  });

  it("commits managed audit denials before returning bearer and cursor errors", async () => {
    for (const role of ["operator", "admin"]) {
      const actor = await login(`audit-denial-${role}`);
      if (role === "operator")
        await prisma.operatorGrant.create({ data: { userId: actor.id, authority: "test" } });
      else
        await prisma.adminGrant.create({ data: { userId: actor.id, invitationId: randomUUID() } });
      const evidence = () =>
        prisma.auditLog.findMany({
          where: { actorUserId: actor.id, category: "operation" },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { action: true, outcome: true },
        });
      await request(server())
        .get("/api/v1/manage/audit")
        .auth(actor.token, { type: "bearer" })
        .expect(403);
      expect(await evidence()).toEqual([{ action: "access.denied", outcome: "denied" }]);
      const invalid = await as("get", "/api/v1/manage/audit?cursor=invalid", actor).expect(400);
      expect(invalid.body.error.code).toBe("invalid_cursor");
      expect(await evidence()).toEqual([
        { action: "access.denied", outcome: "denied" },
        { action: "action.denied", outcome: "denied" },
      ]);
      await as("get", "/api/v1/manage/audit", actor).expect(200);
      expect(await evidence()).toEqual([
        { action: "access.denied", outcome: "denied" },
        { action: "action.denied", outcome: "denied" },
        { action: "audit.read", outcome: "success" },
      ]);
    }
  });

  it("deactivates accounts, revokes sessions and advertises only permitted lifecycle actions", async () => {
    const target = await login("lifecycle");
    const ordinaryOperator = await login("limited-operator");
    await prisma.operatorGrant.create({ data: { userId: ordinaryOperator.id, authority: "test" } });
    const profile = await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200);
    expect(profile.body.data.availableActions).toContain("account.delete");
    const limited = await as(
      "get",
      `/api/v1/operations/accounts/${target.id}`,
      ordinaryOperator,
    ).expect(200);
    expect(limited.body.data.availableActions).not.toContain("account.delete");
    expect(limited.body.data.availableActions).toContain("account.deactivate");
    await command(
      "account.delete",
      target.id,
      profile.body.data.version,
      {},
      ordinaryOperator,
    ).expect(403);
    await command(
      "account.deactivate",
      ordinaryOperator.id,
      1,
      { reason: "owner_request" },
      ordinaryOperator,
    ).expect(403);
    await command("account.delete", operator.id, 1).expect(403);
    await command(
      "account.deactivate",
      target.id,
      profile.body.data.version,
      { reason: "owner_request" },
      ordinaryOperator,
    ).expect(201);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    await as("get", "/api/v1/session", target).expect(401);
    const inactive = await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200);
    expect(inactive.body.data.state).toBe("inactive");
    expect(inactive.body.data.availableActions).toContain("account.reactivate");
    expect(inactive.body.data.availableActions).not.toContain("sessions.revoke");
    await command("account.reactivate", target.id, inactive.body.data.version).expect(201);
    await as("get", "/api/v1/session", target).expect(401);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
  });

  it("schedules admin deletion once, protects pending state and cancels into inactive", async () => {
    const target = await login("deletion-cancel");
    const profile = await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200);
    const operationId = randomUUID(),
      before = Date.now();
    const result = await command("account.delete", target.id, profile.body.data.version, {
      operationId,
    }).expect(201);
    const scheduled = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(scheduled.accountState).toBe("inactive");
    expect(scheduled.deletionScheduledFor?.getTime()).toBeGreaterThanOrEqual(
      before + 14 * 86400000,
    );
    expect(scheduled.deletionScheduledFor?.getTime()).toBeLessThanOrEqual(
      Date.now() + 14 * 86400000,
    );
    await command("account.delete", target.id, profile.body.data.version, { operationId }).expect(
      201,
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).deletionScheduledFor,
    ).toEqual(scheduled.deletionScheduledFor);
    await command("account.reactivate", target.id, result.body.data.version).expect(403);
    await command("account.cancel_deletion", target.id, profile.body.data.version, {
      reason: "owner_request",
    }).expect(409);
    const cancel = await command("account.cancel_deletion", target.id, result.body.data.version, {
      reason: "owner_request",
    }).expect(201);
    const account = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(account.deletionScheduledFor).toBeNull();
    expect(account.accountState).toBe("inactive");
    await pruneDeletedAccounts(prisma, new Date(Date.now() + 15 * 86400000));
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
    await command("account.reactivate", target.id, cancel.body.data.version).expect(201);
  });

  it("deletes only due accounts, cascades owned content and anonymizes retained contributions", async () => {
    const target = await login("deletion-due");
    const own = await as("post", "/api/v1/collections", target)
      .send({ slug: `delete-${randomUUID()}`, title: "Owned content" })
      .expect(201);
    const foreign = await create();
    const comment = await prisma.collectionComment.create({
      data: { collectionId: foreign.id, authorUserId: target.id, body: "Retained contribution" },
    });
    const profile = await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200);
    await command("account.delete", target.id, profile.body.data.version).expect(201);
    await pruneDeletedAccounts(prisma);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
    const deadline = (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
      .deletionScheduledFor;
    if (!deadline) throw new Error("Missing deletion deadline");
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_fail_deletion_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'account.deleted' THEN RAISE EXCEPTION 'synthetic cleanup failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_fail_deletion_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_deletion_audit()`,
    );
    try {
      await expect(pruneDeletedAccounts(prisma, deadline)).rejects.toThrow();
      expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
      expect(
        await prisma.collection.findUnique({ where: { id: own.body.data.id } }),
      ).not.toBeNull();
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER test_fail_deletion_audit ON audit_logs");
      await prisma.$executeRawUnsafe("DROP FUNCTION test_fail_deletion_audit()");
    }
    await pruneDeletedAccounts(prisma, deadline);
    await pruneDeletedAccounts(prisma, deadline);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.collection.findUnique({ where: { id: own.body.data.id } })).toBeNull();
    expect(
      (await prisma.collectionComment.findUniqueOrThrow({ where: { id: comment.id } }))
        .authorUserId,
    ).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { targetUserId: target.id, action: "account.deleted" },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { targetUserId: target.id, action: "account.delete" },
      }),
    ).toBe(1);
  });

  it("serializes deletion cancellation against due cleanup", async () => {
    const target = await login("deletion-race");
    const profile = await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200);
    const schedule = await command("account.delete", target.id, profile.body.data.version).expect(
      201,
    );
    const due = (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
      .deletionScheduledFor;
    if (!due) throw new Error("Missing deadline");
    const [cancel] = await Promise.all([
      command("account.cancel_deletion", target.id, schedule.body.data.version, {
        reason: "owner_request",
      }),
      pruneDeletedAccounts(prisma, due),
    ]);
    const remaining = await prisma.user.findUnique({ where: { id: target.id } });
    if (cancel.status === 201) {
      expect(remaining?.deletionScheduledFor).toBeNull();
      expect(remaining?.accountState).toBe("inactive");
    } else {
      expect(cancel.status).toBe(404);
      expect(remaining).toBeNull();
    }
  });

  it("unifies collections without private-title disclosure or a service content bypass", async () => {
    const hidden = await create(false),
      publicCollection = await create(true);
    const lookup = (id: string, actor = operator) =>
      as("get", `/api/v1/manage/collections?q=${encodeURIComponent(id)}`, actor);
    expect((await lookup(hidden.id).expect(200)).body.data).toEqual([]);
    const owned = (await lookup(hidden.id, owner).expect(200)).body.data[0];
    expect(owned.availableActions).toContain("delete");
    expect(owned.availableActions).toContain("publish");
    expect(owned.availableActions).not.toContain("hold");
    const pub = (await lookup(`https://example.com/c/${publicCollection.id}?s=ignored`).expect(200))
      .body.data[0];
    expect(pub.availableActions).toContain("hold");
    expect(pub.availableActions).not.toContain("delete");
    expect(pub.availableActions).not.toContain("edit");
    await command("collection.hold", publicCollection.id, 0).expect(201);
    await as("post", `/api/v1/collections/${publicCollection.id}/unpublish`, owner).expect(201);
    const held = (await lookup(publicCollection.id).expect(200)).body.data[0];
    expect(held.title).toBeNull();
    expect(held.visibility).toBeNull();
    expect(held.availableActions).toEqual(["release"]);
    await as("delete", `/api/v1/collections/${hidden.id}`).expect(403);
    await as("get", `/api/v1/collections/${publicCollection.id}`).expect(404);
    const first = await as("get", "/api/v1/manage/collections?limit=1", owner).expect(200);
    expect(first.body.meta.nextCursor).toBeTruthy();
    await as(
      "get",
      `/api/v1/manage/collections?q=${hidden.id}&cursor=${first.body.meta.nextCursor}`,
      owner,
    ).expect(400);
    await request(server())
      .get("/api/v1/manage/collections")
      .auth(operator.token, { type: "bearer" })
      .expect(403);
  });

  it("returns bounded account profile evidence without credentials or client metadata", async () => {
    const target = await login("profile");
    await prisma.user.update({ where: { id: target.id }, data: { bio: "Profile fixture" } });
    const now = new Date();
    const secret = `session-secret-${randomUUID()}`;
    await prisma.session.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        userId: target.id,
        token: `${secret}-${index}`,
        expiresAt: new Date(now.getTime() + 3600000),
        createdAt: new Date(now.getTime() + index),
        ipAddress: "192.0.2.42",
        userAgent: "Excluded client metadata",
      })),
    });
    const expired = await prisma.session.create({
      data: {
        userId: target.id,
        token: `${secret}-expired`,
        expiresAt: new Date(now.getTime() - 1000),
      },
    });
    const response = await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200);
    const profile = response.body.data;
    expect(profile).toMatchObject({
      bio: "Profile fixture",
      lastLoginAt: (
        await prisma.user.findUniqueOrThrow({ where: { id: target.id } })
      ).lastLoginAt?.toISOString(),
      state: "active",
      suspensionReason: null,
      suspendedAt: null,
      sessions: 102,
    });
    expect(profile.activeSessions).toHaveLength(100);
    expect(
      profile.activeSessions.every(
        (s: { id: string; expiresAt: string }) =>
          s.id !== expired.id && Date.parse(s.expiresAt) > Date.parse(profile.sessionsAsOf),
      ),
    ).toBe(true);
    expect(Object.keys(profile.activeSessions[0]).sort()).toEqual([
      "createdAt",
      "current",
      "expiresAt",
      "id",
      "verifiedAt",
    ]);
    for (const excluded of [
      secret,
      "192.0.2.42",
      "Excluded client metadata",
      "ipAddress",
      "userAgent",
      "password",
      "accessToken",
    ])
      expect(JSON.stringify(profile)).not.toContain(excluded);
    const own = await as("get", `/api/v1/operations/accounts/${operator.id}`).expect(200);
    expect(
      own.body.data.activeSessions.filter((s: { current: boolean }) => s.current),
    ).toHaveLength(1);
    await as("get", `/api/v1/operations/accounts/${target.id}`, target).expect(403);
    await request(server())
      .get(`/api/v1/operations/accounts/${target.id}`)
      .auth(operator.token, { type: "bearer" })
      .expect(403);
    await command("account.suspend", target.id, 1).expect(201);
    const suspended = (await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200)).body
      .data;
    expect(suspended).toMatchObject({
      state: "suspended",
      suspensionReason: "spam",
      sessions: 0,
      activeSessions: [],
    });
    expect(Number.isFinite(Date.parse(suspended.suspendedAt))).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { targetUserId: target.id, action: "account.read" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.outcome).toBe("success");
  });

  it("requires an explicit live grant, cookie authority, exact Origin and recent code verification", async () => {
    await as("get", "/api/v1/operations/accounts", owner).expect(403);
    await request(server())
      .get("/api/v1/operations/accounts")
      .set("Authorization", `Bearer ${operator.token}`)
      .expect(403);
    // Operator commands carry cookie authority only with the exact Origin.
    await request(server())
      .post("/api/v1/operations/commands")
      .set("Cookie", operator.cookie)
      .send({
        action: "sessions.revoke",
        targetId: owner.id,
        version: 1,
        reason: "account_compromise",
        operationId: randomUUID(),
      })
      .expect(403);
    const lookup = await as(
      "get",
      `/api/v1/operations/accounts?q=${encodeURIComponent(owner.email.toUpperCase())}`,
    ).expect(200);
    expect(lookup.body.data.map((a: { id: string }) => a.id)).toEqual([owner.id]);
    expect(JSON.stringify(lookup.body)).not.toContain("token");
    const byId = await as("get", `/api/v1/operations/accounts?q=${owner.id.toUpperCase()}`).expect(
      200,
    );
    expect(byId.body.data.map((a: { id: string }) => a.id)).toEqual([owner.id]);
    const storedOwner = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(byId.body.data[0].username).toBe(storedOwner.username);
    expect(byId.body.data[0].sessions).toBe(
      await prisma.session.count({ where: { userId: owner.id, expiresAt: { gt: new Date() } } }),
    );
    expect(
      (await as("get", `/api/v1/operations/accounts?q=${randomUUID()}`).expect(200)).body.data,
    ).toEqual([]);
    await prisma.session.updateMany({
      where: { userId: operator.id },
      data: { verifiedAt: new Date(Date.now() - 360000) },
    });
    const stale = await command("sessions.revoke", reader.id, 1).expect(403);
    expect(stale.body.error.code).toBe("recent_auth_required");
    await prisma.session.updateMany({
      where: { userId: operator.id },
      data: { verifiedAt: new Date() },
    });
  });
  it("does not inspect private collections or turn operator status into a content grant", async () => {
    const c = await create(false);
    const result = await as("get", `/api/v1/operations/collections/${c.id}`).expect(200);
    expect(result.body.data).toBeNull();
    await as("get", `/api/v1/collections/${c.id}`).expect(404);
    await command("collection.hold", c.id, 0).expect(404);
  });
  it("holds only the destination, redacts reference metadata and permits owner correction", async () => {
    const source = await create(),
      target = await create();
    await as("post", `/api/v1/collections/${source.id}/resources/collection`, owner)
      .send({ linkedCollectionId: target.id, position: 0 })
      .expect(201);
    await as("post", `/api/v1/collections/${target.id}/shares`, owner)
      .send({ email: reader.email, role: "contributor" })
      .expect(201);
    await as("post", `/api/v1/collections/${target.id}/save`, reader).expect(201);
    const token = await as("post", `/api/v1/collections/${target.id}/resources/external`, owner)
      .send({ url: "https://fixture-links.dev/held-secret", position: 0 })
      .expect(201);
    expect(token.body.data.id).toBeDefined();
    await command("collection.hold", target.id, 0).expect(201);
    await request(server()).get(`/api/v1/collections/${target.id}`).expect(404);
    await as("get", `/api/v1/collections/${target.id}`, reader).expect(404);
    const resources = await request(server())
      .get(`/api/v1/collections/${source.id}/resources`)
      .expect(200);
    expect(resources.body.data[0].linkedCollection).toBeNull();
    const file = await as("post", "/api/v1/exports", reader)
      .send({ collectionIds: [source.id], format: "markdown", expand: true })
      .expect(201);
    expect(file.text).not.toContain("held-secret");
    const own = await as("get", `/api/v1/collections/${target.id}`, owner).expect(200);
    expect(own.body.data.restriction.reason).toBe("spam");
    await as("patch", `/api/v1/collections/${target.id}`, owner)
      .send({ version: own.body.data.version, title: "Corrected" })
      .expect(200);
    await as("post", `/api/v1/collections/${target.id}/publish`, owner).expect(403);
    await as("delete", `/api/v1/collections/${source.id}`, owner).expect(200);
    const saved = await as("get", "/api/v1/me/saved", reader).expect(200);
    expect(saved.body.data.find((s: { id: string }) => s.id === target.id).available).toBe(false);
    await command("collection.release", target.id, 1).expect(201);
    await request(server()).get(`/api/v1/collections/${target.id}`).expect(200);
  });
  it("keeps held collections excluded through public pagination but visible to their owner", async () => {
    const older = await create();
    const held = await create();
    const newer = await create();
    await command("collection.hold", held.id, 0).expect(201);
    const profile = await as("get", "/api/v1/profile", owner).expect(200);
    const hubId = profile.body.data.hubId;
    const publicPath = `/api/v1/hubs/${hubId}/collections?limit=1`;
    const first = await request(server()).get(publicPath).expect(200);
    expect(first.body.data[0].id).toBe(newer.id);
    const second = await request(server())
      .get(`${publicPath}&cursor=${encodeURIComponent(first.body.meta.nextCursor)}`)
      .expect(200);
    expect(second.body.data[0].id).toBe(older.id);
    const own = await as("get", `/api/v1/hubs/${hubId}/collections?limit=100`, owner).expect(200);
    expect(own.body.data.some((c: { id: string }) => c.id === held.id)).toBe(true);
  });
  it("suspends sessions and distribution atomically; reactivation requires fresh sign-in", async () => {
    const target = await login("suspended");
    await changeOperatorGrant(prisma, {
      userId: target.id,
      grant: true,
      authority: "test-deployment",
      version: 1,
    });
    const c = await as("post", "/api/v1/collections", target)
      .send({ slug: `s-${randomUUID()}`, title: "Suspended fixture", published: true })
      .expect(201);
    const account = await as("get", `/api/v1/operations/accounts/${target.id}`).expect(200);
    await command("account.suspend", target.id, account.body.data.version).expect(201);
    expect(await prisma.operatorGrant.findUnique({ where: { userId: target.id } })).toBeNull();
    await as("get", "/api/v1/profile", target).expect(401);
    const raw = await as("get", "/api/v1/auth/get-session", target).expect(200);
    expect(raw.body).toBeNull();
    await request(server()).get(`/api/v1/collections/${c.body.data.id}`).expect(404);
    await as("post", "/api/v1/auth/code/send", target).send({ email: target.email }).expect(200);
    await command("account.reactivate", target.id, account.body.data.version + 1).expect(201);
    await as("get", "/api/v1/profile", target).expect(401);
    expect(await prisma.operatorGrant.findUnique({ where: { userId: target.id } })).toBeNull();
    await request(server()).get(`/api/v1/collections/${c.body.data.id}`).expect(200);
  });
  it("deduplicates action retries, rejects stale/conflicting submissions and protects self suspension", async () => {
    const c = await create();
    const operationId = randomUUID();
    const first = await command("collection.hold", c.id, 0, { operationId }).expect(201);
    const again = await command("collection.hold", c.id, 0, { operationId }).expect(201);
    expect(again.body.data).toEqual(first.body.data);
    await command("collection.release", c.id, 0, { operationId }).expect(409);
    await command("collection.release", c.id, 0).expect(409);
    expect(await prisma.auditLog.count({ where: { operationId } })).toBe(1);
    const account = await as("get", `/api/v1/operations/accounts/${operator.id}`).expect(200);
    await command("account.suspend", operator.id, account.body.data.version).expect(403);
  });
  it("retires split audit and held-only collection list routes", async () => {
    await as("get", "/api/v1/me/audit").expect(404);
    await as("get", "/api/v1/operations/audit").expect(404);
    await as("get", "/api/v1/operations/collections").expect(404);
  });
  it("lists held collections and finds a collection from its pasted link", async () => {
    const c = await create();
    const hub = await prisma.hub.findUniqueOrThrow({ where: { id: c.hubId } });
    for (const link of [
      `http://localhost:3000/c/${c.id}`,
      `/c/${c.id}`,
      `https://nslinkhub.dev/@${hub.handle}/${c.slug}`,
    ]) {
      const found = await as(
        "get",
        `/api/v1/manage/collections?${new URLSearchParams({ q: link })}`,
      ).expect(200);
      expect(found.body.data[0]).toMatchObject({ id: c.id, hubHandle: hub.handle, held: false });
    }
    const missing = await as(
      "get",
      `/api/v1/manage/collections?${new URLSearchParams({ q: "not a link" })}`,
    ).expect(200);
    expect(missing.body.data).toEqual([]);
    await command("collection.hold", c.id, 0).expect(201);
    const held = await as("get", `/api/v1/manage/collections?q=${c.id}`).expect(200);
    expect(held.body.data[0]).toMatchObject({ id: c.id, held: true, hubHandle: hub.handle });
    expect(held.body.data[0].availableActions).toContain("release");
    await command("collection.release", c.id, 1).expect(201);
    const after = await as("get", `/api/v1/manage/collections?q=${c.id}`).expect(200);
    expect(after.body.data[0]).toMatchObject({ id: c.id, held: false });
  });
  it("rolls back restrictions if audit persistence fails", async () => {
    const c = await create();
    // A database trigger exercises the actual transaction client, not a mock
    // on a different Prisma delegate.
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_fail_audit_logs() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_fail_audit_logs BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_audit_logs()`,
    );
    try {
      await command("collection.hold", c.id, 0).expect(500);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER test_fail_audit_logs ON audit_logs");
      await prisma.$executeRawUnsafe("DROP FUNCTION test_fail_audit_logs()");
    }
    expect(await prisma.collectionHold.findUnique({ where: { collectionId: c.id } })).toBeNull();
  });
  it("audits lookup without its email and cleans history without lifting restrictions", async () => {
    await as("get", `/api/v1/operations/accounts?q=${encodeURIComponent(owner.email)}`).expect(200);
    const audit = await as(
      "get",
      `/api/v1/manage/audit?${new URLSearchParams({ targetId: owner.id, action: "accounts.lookup", limit: "1" })}`,
    ).expect(200);
    expect(audit.body.data).toHaveLength(1);
    expect(JSON.stringify(audit.body)).not.toContain(owner.email);
    const person = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: operator.id } });
    const byUsername = await as(
      "get",
      `/api/v1/manage/audit?${new URLSearchParams({ actor: actor.username, targetId: owner.id, action: "accounts.lookup", limit: "1" })}`,
    ).expect(200);
    expect(byUsername.body.data[0].id).toBe(audit.body.data[0].id);
    expect(byUsername.body.data[0].targetUsername).toBe(person.username);

    const c = await create();
    await command("collection.hold", c.id, 0).expect(201);
    await prisma.auditLog.updateMany({
      where: { collectionId: c.id },
      data: { createdAt: new Date(Date.now() - 366 * 86400000) },
    });
    await app.get(RequestBudgetMaintenance).prune();
    expect(
      await prisma.auditLog.count({ where: { collectionId: c.id, category: "operation" } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { collectionId: c.id, category: "content" } }),
    ).toBeGreaterThan(0);
    expect(
      (await prisma.collectionHold.findUniqueOrThrow({ where: { collectionId: c.id } })).active,
    ).toBe(true);
  });
  it("uses one audit model and timeline with permission-scoped search and stable pagination", async () => {
    const c = await create(false);
    const owned = await as("post", "/api/v1/collections")
      .send({
        published: false,
        title: "Operator own private collection",
        slug: `audit-own-${randomUUID()}`,
      })
      .expect(201);
    const at = new Date(Date.now() - 1000);
    const events: { id: string }[] = [];
    for (const data of [
      {
        category: "content",
        hubId: owned.body.data.hubId,
        collectionId: owned.body.data.id,
        action: "collection.updated",
      },
      { category: "operation", action: "account.read", outcome: "denied" },
      {
        category: "authentication",
        targetUserId: operator.id,
        action: "security.sign_in.email",
        outcome: "success",
      },
    ])
      events.push(
        await prisma.auditLog.create({
          data: { ...data, actorUserId: operator.id, createdAt: at },
        }),
      );
    for (const event of events)
      await prisma.$executeRaw`
      UPDATE audit_logs SET created_at = created_at + interval '100 microseconds' WHERE id = ${event.id}::uuid`;
    const q = new URLSearchParams({
      actor: operator.id,
      from: at.toISOString(),
      to: new Date(at.getTime() + 1).toISOString(),
      limit: "1",
      view: "actions",
    });
    const found: string[] = [];
    for (let i = 0; i < 3; i++) {
      const page = await as("get", `/api/v1/manage/audit?${q}`).expect(200);
      expect(page.body.data).toHaveLength(1);
      found.push(page.body.data[0].id);
      if (i < 2) {
        expect(page.body.meta.nextCursor).toBeString();
        q.set("cursor", page.body.meta.nextCursor);
      } else expect(page.body.meta.nextCursor).toBeNull();
    }
    expect(found).toEqual(
      events
        .map((e) => e.id)
        .sort()
        .reverse(),
    );
    const searched = await as(
      "get",
      `/api/v1/manage/audit?q=${operator.id}&action=security.sign_in.email`,
    ).expect(200);
    expect(searched.body.data.some((e: { id: string }) => e.id === events[2].id)).toBe(true);
    const byLabel = await as(
      "get",
      "/api/v1/manage/audit?q=Sign%20in%20with%20email&action=security.sign_in.email",
    ).expect(200);
    expect(byLabel.body.data.some((e: { id: string }) => e.id === events[2].id)).toBe(true);
    const hidden = await as("get", `/api/v1/manage/audit?targetId=${c.id}`).expect(200);
    expect(hidden.body.data).toEqual([]);
    const own = await as("get", `/api/v1/manage/audit?targetId=${c.id}`, owner).expect(200);
    expect(own.body.data.some((e: { action: string }) => e.action === "collection.created")).toBe(
      true,
    );
    const stranger = await as("get", `/api/v1/manage/audit?q=${c.id}`, reader).expect(200);
    expect(stranger.body.data).toEqual([]);
    const noService = await as("get", "/api/v1/manage/audit?action=account.read", owner).expect(
      200,
    );
    expect(noService.body.data).toEqual([]);
    const changedScope = await as("get", `/api/v1/manage/audit?${q}`, owner).expect(400);
    expect(changedScope.body.error.code).toBe("invalid_cursor");
    expect(JSON.stringify(searched.body.data)).not.toContain("payloadHash");
    expect(
      await prisma.$queryRaw<
        { tablename: string }[]
      >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('audit_records', 'operator_audit', 'auth_audit')`,
    ).toEqual([]);
  });
  it("keeps audit filters bound to IDs across renames, transfers and scope changes", async () => {
    const c = await create();
    const hub = await prisma.hub.findUniqueOrThrow({ where: { id: c.hubId } });
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: operator.id } });
    await command("collection.hold", c.id, 0).expect(201);
    await command("collection.release", c.id, 1).expect(201);
    const filter = new URLSearchParams({
      actor: actor.username,
      hub: `@${hub.handle}`,
      targetId: c.id,
      limit: "1",
    });
    const first = await as("get", `/api/v1/manage/audit?${filter}`).expect(200);
    expect(first.body.data[0].hubId).toBe(hub.id);
    expect(first.body.data[0].actorUsername).toBe(actor.username);
    expect(first.body.meta.auditFilters).toMatchObject({
      actor: operator.id,
      hub: hub.id,
      targetId: c.id,
    });
    expect(first.body.meta.nextCursor).toBeString();
    const canonical = new URLSearchParams({
      ...first.body.meta.auditFilters,
      cursor: first.body.meta.nextCursor,
      limit: "1",
    });
    const nextName = `renamed-${randomUUID().slice(-8)}`;
    await prisma.user.update({ where: { id: operator.id }, data: { username: nextName } });
    await prisma.hub.update({
      where: { id: hub.id },
      data: { handle: `renamed-${randomUUID().slice(-8)}` },
    });
    // A transfer after an event cannot change that event's recorded hub.
    await as("post", "/api/v1/hubs", reader).send({}).expect(201);
    const recipientHub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: reader.id } });
    await prisma.collection.update({ where: { id: c.id }, data: { hubId: recipientHub.id } });
    const next = await as("get", `/api/v1/manage/audit?${canonical}`).expect(200);
    expect(next.body.data).toHaveLength(1);
    expect(next.body.data[0].id).not.toBe(first.body.data[0].id);
    expect(next.body.data[0].actorUsername).toBe(nextName);
    expect(next.body.data[0].hubId).toBe(hub.id);
    canonical.set("actor", owner.id);
    await as("get", `/api/v1/manage/audit?${canonical}`).expect(400);
    await as("get", `/api/v1/manage/audit?actor=${owner.email}`).expect(400);
    await as("get", `/api/v1/manage/audit?targetId=${c.id.slice(-8)}`).expect(400);
    const noMatch = await as("get", "/api/v1/manage/audit?actor=nobody-exists-fixture").expect(200);
    expect(noMatch.body.data).toEqual([]);
    // Neither service authority nor an explicit hub ID grants another hub's trail.
    expect(
      (await as("get", `/api/v1/manage/audit?hub=${hub.id}`, reader).expect(200)).body.data,
    ).toEqual([]);
    const ownerEvents = await as(
      "get",
      `/api/v1/manage/audit?targetId=${c.id}&limit=1`,
      owner,
    ).expect(200);
    expect(ownerEvents.body.data[0].actorUserId).toBe(owner.id);
    expect(ownerEvents.body.data[0].actorUsername).toBeString();
    const foreign = await as("get", `/api/v1/manage/audit?targetId=${c.id}`, reader).expect(200);
    expect(foreign.body.data).toEqual([]);
    // Deleted/unavailable identities retain the immutable reference without a fake name.
    const missingUser = randomUUID();
    await prisma.auditLog.create({
      data: {
        hubId: hub.id,
        actorUserId: missingUser,
        action: "collection.updated",
        collectionId: c.id,
      },
    });
    const absent = await as("get", `/api/v1/manage/audit?actor=${missingUser}`, owner).expect(200);
    expect(absent.body.data[0].actorUserId).toBe(missingUser);
    expect(absent.body.data[0].actorUsername).toBeNull();
    const legacy = await prisma.auditLog.create({
      data: {
        category: "operation",
        actorKind: "user",
        actorUserId: operator.id,
        collectionId: c.id,
        action: "collection.inspect",
        outcome: "success",
      },
    });
    const history = await as("get", `/api/v1/manage/audit?targetId=${c.id}`).expect(200);
    expect(history.body.data.find((r: { id: string }) => r.id === legacy.id).hubId).toBeNull();
  });
  it("keeps changes and denials visible while paging past routine service reads", async () => {
    const c = await create();
    await command("collection.hold", c.id, 0).expect(201);
    await prisma.auditLog.createMany({
      data: Array.from({ length: 25 }, () => ({
        category: "operation",
        actorKind: "user",
        actorUserId: operator.id,
        action: "accounts.list",
        outcome: "success",
      })),
    });
    await prisma.auditLog.create({
      data: {
        category: "operation",
        actorKind: "user",
        actorUserId: operator.id,
        action: "account.read",
        outcome: "denied",
      },
    });
    const first = await as("get", "/api/v1/manage/audit?view=actions&limit=1").expect(200);
    expect(first.body.data[0].outcome).toBe("denied");
    const query = new URLSearchParams({
      ...first.body.meta.auditFilters,
      limit: "1",
      cursor: first.body.meta.nextCursor,
    });
    const next = await as("get", `/api/v1/manage/audit?${query}`).expect(200);
    expect(next.body.data[0]).toMatchObject({
      action: "collection.hold",
      beforeState: "clear",
      afterState: "held",
      outcome: "success",
    });
    query.set("view", "all");
    await as("get", `/api/v1/manage/audit?${query}`).expect(400);
    const reads = await as(
      "get",
      "/api/v1/manage/audit?view=actions&action=accounts.list&limit=1",
    ).expect(200);
    expect(reads.body.meta.auditFilters.view).toBe("all");
    expect(reads.body.data[0].action).toBe("accounts.list");
    const byTarget = await as("get", `/api/v1/manage/audit?view=actions&q=${c.id}`).expect(200);
    expect(byTarget.body.data[0].collectionId).toBe(c.id);
    const held = await as("get", "/api/v1/manage/audit?view=actions&q=No%20hold%20Held").expect(
      200,
    );
    expect(held.body.data[0].collectionId).toBe(c.id);
    const denied = await as("get", "/api/v1/manage/audit?view=actions&q=Denied").expect(200);
    expect(denied.body.data.length).toBeGreaterThan(0);
    expect(denied.body.data.every((row: { outcome: string }) => row.outcome === "denied")).toBe(
      true,
    );
  });
  async function codeFor(email: string) {
    const row = await prisma.emailOutbox.findFirstOrThrow({
      where: {
        recipientKey: emailKey(emailConfig().suppressionSecret, "recipient", email),
        state: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    const code = unseal(
      row.payload ?? "",
      readSecret("BETTER_AUTH_SECRET") ?? "dev-better-auth-secret",
    ).text.match(/^\d{8}$/m)?.[0];
    if (!code) throw new Error("Expected captured standalone code");
    return code;
  }
  it("revokes pending code proofs and composes suspension with a retained collection hold", async () => {
    const target = await login("proof-revocation");
    const c = await as("post", "/api/v1/collections", target)
      .send({ slug: `proof-${randomUUID()}`, title: "Held through reactivation", published: true })
      .expect(201);
    await command("collection.hold", c.body.data.id, 0).expect(201);
    await request(server())
      .post("/api/v1/auth/code/send")
      .send({ email: target.email })
      .expect(200);
    const code = await codeFor(target.email);
    await command("account.suspend", target.id, 1).expect(201);
    await command("account.reactivate", target.id, 2).expect(201);
    await request(server())
      .post("/api/v1/auth/code/verify")
      .send({ email: target.email, code })
      .expect(400);
    await request(server()).get(`/api/v1/collections/${c.body.data.id}`).expect(404);
    await command("collection.release", c.body.data.id, 1).expect(201);
    await request(server()).get(`/api/v1/collections/${c.body.data.id}`).expect(200);
  });
  it("rejects email changes without mutating service authority or invitations", async () => {
    const target = await login("handover"),
      newEmail = `next-${randomUUID()}@example.com`;
    await changeOperatorGrant(prisma, {
      userId: target.id,
      grant: true,
      authority: "test-deployment",
      version: 1,
    });
    await prisma.adminGrant.create({ data: { userId: target.id, invitationId: randomUUID() } });
    const pending = await as("post", "/api/v1/operations/operator-invitations", target)
      .send({ email: `handover-invite-${randomUUID()}@example.com`, operationId: randomUUID() })
      .expect(201);
    await as("post", "/api/v1/auth/email-change/start", target).send({ newEmail }).expect(404);
    await as("post", "/api/v1/auth/email-change/confirm-current", target)
      .send({ code: "12345678" })
      .expect(404);
    await as("post", "/api/v1/auth/email-change/confirm-new", target)
      .send({ code: "12345678" })
      .expect(404);
    expect(await prisma.operatorGrant.findUnique({ where: { userId: target.id } })).not.toBeNull();
    expect(await prisma.adminGrant.findUnique({ where: { userId: target.id } })).not.toBeNull();
    expect(
      (await prisma.serviceInvitation.findUniqueOrThrow({ where: { id: pending.body.data.id } }))
        .state,
    ).toBe("pending");
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { targetUserId: target.id, action: "account.handover" },
      }),
    ).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).email).toBe(
      target.email,
    );
  });
  it("serializes competing operator actions without propagating holds through references", async () => {
    const a = await login("race-a"),
      b = await login("race-b");
    for (const actor of [a, b])
      await changeOperatorGrant(prisma, {
        userId: actor.id,
        grant: true,
        authority: "test-deployment",
        version: 1,
      });
    const responses = await Promise.all([
      command("account.suspend", b.id, 2, {}, a),
      command("account.suspend", a.id, 2, {}, b),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([403, 403]);
    const source = await create(),
      target = await create();
    const [hold, reference] = await Promise.all([
      command("collection.hold", source.id, 0),
      as("post", `/api/v1/collections/${source.id}/resources/collection`, owner).send({
        linkedCollectionId: target.id,
        position: 0,
      }),
    ]);
    expect(hold.status).toBe(201);
    expect(reference.status).toBe(201);
    await request(server()).get(`/api/v1/collections/${target.id}`).expect(200);
  });
  it("paginates active holds without duplicates or private content and rejects unrelated cursors", async () => {
    const collection = await create();
    const seeded = await prisma.collection.createManyAndReturn({
      data: Array.from({ length: 5 }, (_, i) => ({
        hubId: collection.hubId,
        slug: `held-page-${randomUUID()}`,
        title: `Private held title ${i}`,
      })),
    });
    await prisma.collectionHold.createMany({
      data: seeded.map((c) => ({ collectionId: c.id, actorUserId: operator.id, reason: "spam" })),
    });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await as(
        "get",
        `/api/v1/manage/collections?${new URLSearchParams({ limit: "2", ...(cursor ? { cursor } : {}) })}`,
      ).expect(200);
      expect(page.body.data.length).toBeLessThanOrEqual(2);
      expect(JSON.stringify(page.body.data)).not.toContain("Private held title");
      seen.push(...page.body.data.map((c: { id: string }) => c.id));
      cursor = page.body.meta.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    for (const c of seeded) expect(seen).toContain(c.id);
    const accounts = await as("get", "/api/v1/operations/accounts?limit=1").expect(200);
    expect(accounts.body.meta.nextCursor).toBeTruthy();
    const wrong = await as(
      "get",
      `/api/v1/manage/collections?cursor=${encodeURIComponent(accounts.body.meta.nextCursor)}`,
    ).expect(400);
    expect(wrong.body.error.code).toBe("invalid_cursor");
    const personal = await as("get", "/api/v1/manage/collections?limit=100", reader).expect(200);
    for (const c of seeded)
      expect(personal.body.data.some((row: { id: string }) => row.id === c.id)).toBe(false);
  });
});
