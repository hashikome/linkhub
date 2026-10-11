import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInHubOwner } from "./fixtures/sign-in";

describe("bounded audit evidence (HTTP)", () => {
  let app: INestApplication, prisma: PrismaService;
  let token: string, recipientToken: string, actorId: string, recipientId: string, hubId: string;
  const email = `audit-effects-${randomUUID()}@example.com`;
  const as = (method: "get" | "post" | "put" | "delete" | "patch", path: string, auth = token) =>
    request(app.getHttpServer())[method](path).auth(auth, { type: "bearer" });
  async function create() {
    const result = await as("post", "/api/v1/collections")
      .send({
        published: false,
        title: "Private title never captured",
      })
      .expect(201);
    return result.body.data;
  }
  async function latest(collectionId: string, action: string) {
    const result = await as(
      "get",
      `/api/v1/manage/audit?${new URLSearchParams({ targetId: collectionId, action, limit: "1" })}`,
    ).expect(200);
    return result.body.data[0];
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const owner = await signInHubOwner(app.getHttpServer(), {
      email: `audit-owner-${randomUUID()}@example.com`,
      name: "Audit Owner",
    });
    token = owner.headers["set-auth-token"];
    actorId = owner.body.user.id;
    hubId = (await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: actorId } })).id;
    const recipient = await signInHubOwner(app.getHttpServer(), { email, name: "Audit Recipient" });
    recipientToken = recipient.headers["set-auth-token"];
    recipientId = recipient.body.user.id;
  });
  afterAll(async () => {
    await app?.close();
  });

  it("records actual states, no-ops and source changes without capturing content or tokens", async () => {
    const c = await create();
    await as("post", `/api/v1/collections/${c.id}/publish`).expect(201);
    expect(await latest(c.id, "collection.published")).toMatchObject({
      beforeState: "unpublished",
      afterState: "published",
      outcome: "success",
    });
    await as("post", `/api/v1/collections/${c.id}/publish`).expect(201);
    expect(await latest(c.id, "collection.published")).toMatchObject({
      beforeState: "published",
      afterState: "published",
      outcome: "no_change",
    });
    const current = await prisma.collection.findUniqueOrThrow({ where: { id: c.id } });
    await as("patch", `/api/v1/collections/${c.id}`)
      .send({ published: false, version: Number(current.version) })
      .expect(200);
    expect((await latest(c.id, "collection.unpublished")).beforeState).toBe("published");
    const link = await as("put", `/api/v1/collections/${c.id}/link-sharing`)
      .send({ enabled: true })
      .expect(200);
    expect(await latest(c.id, "link.enabled")).toMatchObject({
      beforeState: "disabled",
      afterState: "enabled",
      outcome: "success",
    });
    await as("put", `/api/v1/collections/${c.id}/link-sharing`).send({ enabled: true }).expect(200);
    expect((await latest(c.id, "link.enabled")).outcome).toBe("no_change");
    await as("put", `/api/v1/collections/${c.id}/link-sharing`)
      .send({ enabled: true, rotate: true })
      .expect(200);
    expect(await latest(c.id, "link.rotated")).toMatchObject({
      beforeState: "enabled",
      afterState: "enabled",
      outcome: "success",
    });
    await as("put", `/api/v1/collections/${c.id}/link-sharing`)
      .send({ enabled: false })
      .expect(200);
    expect((await latest(c.id, "link.disabled")).afterState).toBe("disabled");
    await as("post", `/api/v1/collections/${c.id}/shares`)
      .send({ email, role: "viewer" })
      .expect(201);
    expect(await latest(c.id, "share.granted")).toMatchObject({
      beforeState: "none",
      afterState: "direct_viewer",
      outcome: "success",
    });
    await as("post", `/api/v1/collections/${c.id}/shares`)
      .send({ email, role: "viewer" })
      .expect(201);
    expect((await latest(c.id, "share.granted")).outcome).toBe("no_change");
    await as("post", `/api/v1/collections/${c.id}/shares`)
      .send({ email, role: "contributor" })
      .expect(201);
    expect(await latest(c.id, "share.granted")).toMatchObject({
      beforeState: "direct_viewer",
      afterState: "direct_contributor",
      outcome: "success",
    });
    await as("delete", `/api/v1/collections/${c.id}/shares/${recipientId}`).expect(200);
    expect(await latest(c.id, "share.revoked")).toMatchObject({
      beforeState: "direct_contributor",
      afterState: "none",
      outcome: "success",
    });
    await as("delete", `/api/v1/collections/${c.id}/shares/${recipientId}`).expect(200);
    expect((await latest(c.id, "share.revoked")).outcome).toBe("no_change");
    await prisma.collectionShare.create({
      data: { collectionId: c.id, userId: recipientId, role: "viewer", source: "link" },
    });
    await as("post", `/api/v1/collections/${c.id}/shares`)
      .send({ email, role: "viewer" })
      .expect(201);
    expect(await latest(c.id, "share.granted")).toMatchObject({
      beforeState: "link_viewer",
      afterState: "direct_viewer",
      outcome: "success",
    });
    const rows = await prisma.auditLog.findMany({ where: { collectionId: c.id } });
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(c.title);
    expect(stored).not.toContain(link.body.data.token);
    expect(stored).not.toContain(email);
  });

  it("retains the transfer evidence in both hubs without following later ownership", async () => {
    const c = await create();
    await as("post", `/api/v1/collections/${c.id}/shares`)
      .send({ email, role: "contributor" })
      .expect(201);
    await as("post", `/api/v1/collections/${c.id}/transfer`).send({ email }).expect(201);
    const destination = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: recipientId } });
    const outgoing = await latest(c.id, "collection.transferred_out");
    const incoming = await as(
      "get",
      `/api/v1/manage/audit?targetId=${c.id}&action=collection.transferred_in`,
      recipientToken,
    ).expect(200);
    expect(outgoing).toMatchObject({
      beforeState: hubId,
      afterState: destination.id,
      outcome: "success",
    });
    expect(incoming.body.data[0]).toMatchObject({
      beforeState: outgoing.beforeState,
      afterState: outgoing.afterState,
      outcome: outgoing.outcome,
    });
    const before = await prisma.auditLog.count({ where: { collectionId: c.id } });
    await as("post", `/api/v1/collections/${c.id}/publish`).expect(403);
    expect(await prisma.auditLog.count({ where: { collectionId: c.id } })).toBe(before);
  });

  it("rolls back changes when audit persistence fails and never fabricates old effects", async () => {
    const c = await create();
    expect(await latest(c.id, "collection.created")).toMatchObject({
      beforeState: null,
      afterState: null,
      outcome: null,
    });
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_fail_hub_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_fail_hub_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION test_fail_hub_audit()`,
    );
    try {
      await as("post", `/api/v1/collections/${c.id}/publish`).expect(500);
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER test_fail_hub_audit ON audit_logs");
      await prisma.$executeRawUnsafe("DROP FUNCTION test_fail_hub_audit()");
    }
    expect((await prisma.collection.findUniqueOrThrow({ where: { id: c.id } })).published).toBe(
      false,
    );
    expect(
      await prisma.auditLog.count({
        where: { collectionId: c.id, action: "collection.published" },
      }),
    ).toBe(0);
  });

  it("filters reads before paging, records the read and binds the view to the cursor", async () => {
    await create();
    await create();
    await prisma.auditLog.createMany({
      data: Array.from({ length: 25 }, () => ({
        hubId,
        actorUserId: actorId,
        action: "audit.read",
      })),
    });
    const before = await prisma.auditLog.count({ where: { hubId, action: "audit.read" } });
    const first = await as("get", "/api/v1/manage/audit?view=actions&limit=1").expect(200);
    expect(first.body.data[0].action).not.toBe("audit.read");
    expect(await prisma.auditLog.count({ where: { hubId, action: "audit.read" } })).toBe(
      before + 1,
    );
    const query = new URLSearchParams({
      ...first.body.meta.auditFilters,
      limit: "1",
      cursor: first.body.meta.nextCursor,
    });
    const next = await as("get", `/api/v1/manage/audit?${query}`).expect(200);
    expect(next.body.data[0].id).not.toBe(first.body.data[0].id);
    query.set("view", "all");
    await as("get", `/api/v1/manage/audit?${query}`).expect(400);
    const all = await as("get", "/api/v1/manage/audit?view=all&limit=1").expect(200);
    expect(all.body.data[0].action).toBe("audit.read");
    const explicit = await as("get", "/api/v1/manage/audit?view=actions&action=audit.read").expect(
      200,
    );
    expect(explicit.body.meta.auditFilters.view).toBe("all");
    await as("get", "/api/v1/manage/audit?view=invalid").expect(400);
    const foreign = await as(
      "get",
      `/api/v1/manage/audit?view=actions&hub=${hubId}`,
      recipientToken,
    ).expect(200);
    expect(foreign.body.data).toEqual([]);
  });

  it("searches displayed audit content before pagination and binds search to the cursor", async () => {
    const c = await create();
    await as("post", `/api/v1/collections/${c.id}/publish`).expect(201);
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId } });
    const first = await as(
      "get",
      `/api/v1/manage/audit?view=actions&limit=1&q=${actor.username}`,
    ).expect(200);
    expect(first.body.meta.auditFilters.q).toBe(actor.username);
    const query = new URLSearchParams({
      ...first.body.meta.auditFilters,
      limit: "1",
      cursor: first.body.meta.nextCursor,
    });
    const next = await as("get", `/api/v1/manage/audit?${query}`).expect(200);
    expect(next.body.data[0].actorUserId).toBe(actorId);
    query.set("q", recipientId);
    await as("get", `/api/v1/manage/audit?${query}`).expect(400);
    const target = await as("get", `/api/v1/manage/audit?view=actions&q=${c.id}`).expect(200);
    expect(
      target.body.data.every((row: { collectionId: string }) => row.collectionId === c.id),
    ).toBe(true);
    for (const term of [
      "Publish collection",
      "Succeeded",
      "Unpublished → Published",
      c.id.split("-").at(-1) ?? c.id,
    ]) {
      const found = await as(
        "get",
        `/api/v1/manage/audit?view=actions&q=${encodeURIComponent(term)}`,
      ).expect(200);
      expect(
        found.body.data.some((row: { collectionId: string }) => row.collectionId === c.id),
      ).toBe(true);
    }
    for (const term of ["%", "' OR 1=1 --", "missing-audit-person"]) {
      const empty = await as("get", `/api/v1/manage/audit?q=${encodeURIComponent(term)}`).expect(
        200,
      );
      expect(empty.body.data).toEqual([]);
    }
    const unmatched = await as("get", "/api/v1/manage/audit?q=missing-audit-person").expect(200);
    expect(unmatched.body.data).toEqual([]);
    const privateSearch = await as("get", `/api/v1/manage/audit?q=${c.id}`, recipientToken).expect(
      200,
    );
    expect(privateSearch.body.data).toEqual([]);
  });
});
