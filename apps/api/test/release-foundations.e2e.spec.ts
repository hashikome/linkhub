import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import express from "express";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import {
  requestBudget,
  requestBudgetKey,
  trustedProxies,
} from "../src/common/middleware/request-budget";
import { requestIdMiddleware } from "../src/common/middleware/request-id";
import { RequestBudgetMaintenance } from "../src/common/request-budget-maintenance";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("release foundations over real HTTP and PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string;
  let recipient: string;
  let recipientEmail: string;
  let collectionId: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const suffix = crypto.randomUUID();
    async function signup(label: string) {
      const email = `${label}-${suffix}@example.com`;
      const response = await signInWithCode(app.getHttpServer(), { email, name: label });
      return { email, token: response.headers["set-auth-token"] as string };
    }
    owner = (await signup("audit-owner")).token;
    const other = await signup("audit-recipient");
    recipient = other.token;
    recipientEmail = other.email;
    const created = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${owner}`)
      .send({ slug: `audit-${suffix}`, title: "Private title" })
      .expect(201);
    collectionId = created.body.data.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("rolls back the publication if its audit cannot commit", async () => {
    await prisma.$executeRawUnsafe(
      "CREATE FUNCTION test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$",
    );
    await prisma.$executeRawUnsafe(
      "CREATE TRIGGER test_reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_reject_audit()",
    );
    try {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/collections/${collectionId}/publish`)
        .set("Authorization", `Bearer ${owner}`)
        .expect(500);
      expect(response.body.error.message).toBe("Internal server error");
      expect(JSON.stringify(response.body)).not.toContain("synthetic");
      expect(
        (await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })).published,
      ).toBe(false);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER test_reject_audit ON audit_logs");
      await prisma.$executeRawUnsafe("DROP FUNCTION test_reject_audit()");
    }
  });

  it("records publication, links, direct shares, transfer and deletion without moving history", async () => {
    const server = app.getHttpServer();
    await request(server)
      .post(`/api/v1/collections/${collectionId}/publish`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(201);
    const link = await request(server)
      .put(`/api/v1/collections/${collectionId}/link-sharing`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ enabled: true })
      .expect(200);
    const stale = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } });
    const rotated = await request(server)
      .put(`/api/v1/collections/${collectionId}/link-sharing`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ enabled: true, rotate: true })
      .expect(200);
    // Model a preflight read that raced rotation. The locked transaction must
    // use current state, not resurrect the old token from that stale snapshot.
    const preflight = spyOn(prisma.collection, "findUnique").mockResolvedValueOnce(stale);
    try {
      const enabled = await request(server)
        .put(`/api/v1/collections/${collectionId}/link-sharing`)
        .set("Authorization", `Bearer ${owner}`)
        .send({ enabled: true })
        .expect(200);
      expect(enabled.body.data.token).toBeUndefined();
      expect(
        (await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } })).shareTokenHash,
      ).toBe(createHash("sha256").update(rotated.body.data.token).digest("hex"));
    } finally {
      preflight.mockRestore();
    }
    await request(server)
      .post(`/api/v1/collections/${collectionId}/shares`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ email: recipientEmail, role: "contributor" })
      .expect(201);
    await request(server)
      .post(`/api/v1/collections/${collectionId}/transfer`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ email: recipientEmail })
      .expect(201);
    await request(server)
      .post(`/api/v1/collections/${collectionId}/unpublish`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(403);
    await request(server)
      .delete(`/api/v1/collections/${collectionId}`)
      .set("Authorization", `Bearer ${recipient}`)
      .expect(200);
    const old = await request(server)
      .get(`/api/v1/manage/audit?limit=100&targetId=${collectionId}`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    const current = await request(server)
      .get(`/api/v1/manage/audit?limit=100&targetId=${collectionId}`)
      .set("Authorization", `Bearer ${recipient}`)
      .expect(200);
    const oldActions = old.body.data.map((row: { action: string }) => row.action);
    expect(oldActions).toContain("collection.transferred_out");
    expect(oldActions).toContain("share.granted");
    expect(oldActions).toContain("link.rotated");
    expect(oldActions).not.toContain("collection.deleted");
    expect(current.body.data.map((row: { action: string }) => row.action)).toEqual([
      "collection.deleted",
      "collection.transferred_in",
    ]);
    const serialized = JSON.stringify([old.body, current.body]);
    for (const forbidden of [recipientEmail, "Private title", link.body.data.token])
      expect(serialized).not.toContain(forbidden);
    await request(server).get("/api/v1/manage/audit").expect(401);
    const page = await request(server)
      .get("/api/v1/manage/audit?limit=1")
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    const next = await request(server)
      .get(`/api/v1/manage/audit?limit=1&cursor=${page.body.meta.nextCursor}`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    expect(next.body.data[0].id).not.toBe(page.body.data[0].id);
    await request(server)
      .get(`/api/v1/manage/audit?cursor=${page.body.meta.nextCursor}`)
      .set("Authorization", `Bearer ${recipient}`)
      .expect(400);
  });

  it("enforces a shared atomic budget across replicas and ignores spoofed forwarding", async () => {
    const secret = "synthetic-budget-key";
    const apps = [express(), express()];
    for (const target of apps) {
      target.set("trust proxy", trustedProxies(undefined));
      target.use(requestIdMiddleware, requestBudget(prisma, secret));
      target.post("/api/v1/auth/probe", (_req, res) => res.sendStatus(200));
    }
    const responses = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        request(apps[i % 2])
          .post(i % 2 ? "/API/v1/AUTH/probe" : "/api/v1/auth/probe")
          .set("X-Forwarded-For", `198.51.100.${i + 1}`),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(30);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(10);
    expect(responses.find((r) => r.status === 429)?.headers["retry-after"]).toBe("60");
    expect(requestBudgetKey("auth", "127.0.0.1", secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(() => trustedProxies("*")).toThrow();
    expect(() => trustedProxies("127.0.0.1/33")).toThrow();
  });

  it("fails closed on budget-store failure while probes remain available", async () => {
    const target = express();
    target.use(
      requestIdMiddleware,
      requestBudget({
        $queryRaw: () => Promise.reject(new Error("private database details")),
      } as unknown as PrismaService),
    );
    target.get("/api/v1/health", (_req, res) => res.sendStatus(200));
    expect((await request(target).post("/api/v1/auth/probe").expect(503)).text).not.toContain(
      "private",
    );
    await request(target).get("/api/v1/health").expect(200);
  });

  it("expires old counters without deleting active budgets", async () => {
    await prisma.requestBudget.createMany({
      data: [
        { key: "test-expired", count: 1, expiresAt: new Date(Date.now() - 2 * 86400000) },
        { key: "test-active", count: 1, expiresAt: new Date(Date.now() + 60000) },
      ],
    });
    await app.get(RequestBudgetMaintenance).prune();
    expect(await prisma.requestBudget.findUnique({ where: { key: "test-expired" } })).toBeNull();
    expect(await prisma.requestBudget.findUnique({ where: { key: "test-active" } })).not.toBeNull();
  });
});
