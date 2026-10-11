import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { publicOrigins } from "@nslinkhub/config/public-origins";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInHubOwner } from "./fixtures/sign-in";

describe("owner collection reference lifecycle", () => {
  let app: INestApplication, db: PrismaService;
  let owner: { token: string; hubId: string; id: string }, other: typeof owner;
  const otherEmail = `reference-recipient-${randomUUID()}@example.com`;
  const api = () => request(app.getHttpServer());
  async function collection(actor = owner) {
    return db.collection.create({
      data: {
        hubId: actor.hubId,
        title: `Collection ${randomUUID()}`,
        slug: randomUUID(),
        published: true,
      },
    });
  }
  async function link(source: string, target: string, position = 0, token = owner.token) {
    return api()
      .post(`/api/v1/collections/${source}/resources/collection`)
      .auth(token, { type: "bearer" })
      .send({ linkedCollectionId: target, position });
  }
  async function preview(id: string, action = "delete") {
    return (
      await api()
        .get(`/api/v1/collections/${id}/impact`)
        .query({ action })
        .auth(owner.token, { type: "bearer" })
        .expect(200)
    ).body.data;
  }
  const remove = (id: string, impactToken?: string) =>
    api()
      .delete(`/api/v1/collections/${id}`)
      .auth(owner.token, { type: "bearer" })
      .send({ impactToken });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    async function person(email: string) {
      const result = await signInHubOwner(app.getHttpServer(), { email, name: "Reference owner" });
      const id = result.body.user.id;
      return {
        id,
        token: result.headers["set-auth-token"] as string,
        hubId: (await db.hub.findUniqueOrThrow({ where: { ownerUserId: id } })).id,
      };
    }
    owner = await person(`reference-owner-${randomUUID()}@example.com`);
    other = await person(otherEmail);
  });
  beforeEach(async () => {
    await db.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  it("allows owners and contributors to reference readable targets in the same hub", async () => {
    const a = await collection(),
      b = await collection(),
      foreign = await collection(other);
    expect((await link(a.id, b.id)).status).toBe(201);
    expect((await link(a.id, a.id, 1)).status).toBe(400);
    expect((await link(a.id, foreign.id, 1)).status).toBe(404);
    await db.collectionShare.create({
      data: { collectionId: a.id, userId: other.id, role: "contributor", source: "direct" },
    });
    expect((await link(a.id, foreign.id, 1, other.token)).status).toBe(404);
    const sameOwner = await collection();
    expect((await link(a.id, sameOwner.id, 1, other.token)).status).toBe(201);
    await api()
      .get(`/api/v1/collections/${a.id}/impact?action=delete`)
      .auth(other.token, { type: "bearer" })
      .expect(403);
  });

  it("detects collection URLs in ordinary link capture, deduplicates aliases and replays safely", async () => {
    const source = await collection(),
      target = await collection();
    const origin = publicOrigins(process.env).webOrigin;
    const url = `${origin}/c/${target.id}?utm_source=copy`;
    const body = {
      operationId: randomUUID(),
      startedAt: Date.now(),
      destination: source.id,
      links: [{ url, tags: ["Reading"] }],
    };
    const save = (input = body, token = owner.token) =>
      api().post("/api/v1/capture").auth(token, { type: "bearer" }).send(input);
    const result = (await save().expect(201)).body.data;
    expect((await save().expect(201)).body.data).toEqual(result);
    const row = await db.resource.findUniqueOrThrow({ where: { id: result.resourceIds[0] } });
    expect(row.kind).toBe("collection_link");
    expect(row.url).toBeNull();
    expect(row.linkedCollectionId).toBe(target.id);
    expect(await db.linkMetadata.findFirst({ where: { url } })).toBeNull();
    const hub = await db.hub.findUniqueOrThrow({ where: { id: owner.hubId } });
    const aliases = {
      ...body,
      operationId: randomUUID(),
      links: [
        { url: `${origin}/@${hub.handle}/${target.slug}`, tags: [] },
        { url, tags: [] },
      ],
    };
    expect((await save(aliases).expect(201)).body.data).toEqual(result);
    expect((await save(aliases).expect(201)).body.data).toEqual(result);
    await db.collection.update({ where: { id: target.id }, data: { title: "Renamed target" } });
    const view = (
      await api()
        .get(`/api/v1/collections/${source.id}/resources`)
        .auth(owner.token, { type: "bearer" })
        .expect(200)
    ).body.data;
    expect(view[0].title).toBe("Renamed target");
    expect(view[0].tags).toEqual(["reading"]);
    await api()
      .post(`/api/v1/collections/${source.id}/resources/external`)
      .auth(owner.token, { type: "bearer" })
      .send({ url, position: 1 })
      .expect(409);
    await db.collectionShare.create({
      data: { collectionId: source.id, userId: other.id, role: "contributor", source: "direct" },
    });
    const second = await collection();
    const contributed = {
      ...body,
      operationId: randomUUID(),
      links: [{ url: `${origin}/c/${second.id}`, tags: [] }],
    };
    const contribution = (await save(contributed, other.token).expect(201)).body.data;
    expect((await save(contributed, other.token).expect(201)).body.data).toEqual(contribution);
    expect(
      (await db.resource.findUniqueOrThrow({ where: { id: contribution.resourceIds[0] } })).kind,
    ).toBe("collection_link");
    await db.collectionShare.delete({
      where: { collectionId_userId: { collectionId: source.id, userId: other.id } },
    });
    await save(contributed, other.token).expect(403);
  });

  it("keeps foreign, unreadable, self and missing collection URLs ordinary without leaking metadata", async () => {
    const source = await collection(),
      foreign = await collection(other),
      hidden = await collection();
    await db.collection.update({ where: { id: hidden.id }, data: { published: false } });
    await db.collectionShare.create({
      data: { collectionId: source.id, userId: other.id, role: "contributor", source: "direct" },
    });
    const origin = publicOrigins(process.env).webOrigin;
    for (const [position, id] of [foreign.id, hidden.id, source.id, randomUUID()].entries()) {
      const url = `${origin}/c/${id}`;
      const result = (
        await api()
          .post(`/api/v1/collections/${source.id}/resources/external`)
          .auth(other.token, { type: "bearer" })
          .send({ url, position })
          .expect(201)
      ).body.data;
      expect(result.kind).toBe("external_link");
      expect(result.url).toBe(url);
      expect(result.collectionHint).toBe(true);
      expect(result.title).toBeNull();
      expect(result.linkedCollectionId).toBeNull();
      const preview = (await api().get("/api/v1/link-preview").query({ url }).expect(200)).body
        .data;
      expect(preview.collectionHint).toBe(true);
      expect(preview.title).toBeNull();
    }
    await api()
      .post(`/api/v1/collections/${source.id}/resources/external`)
      .auth(owner.token, { type: "bearer" })
      .send({ url: `${origin}/settings`, position: 4 })
      .expect(400);
    const target = await collection();
    const direct = (
      await api()
        .post(`/api/v1/collections/${source.id}/resources/external`)
        .auth(other.token, { type: "bearer" })
        .send({ url: `${origin}/c/${target.id}`, position: 4 })
        .expect(201)
    ).body.data;
    expect(direct.kind).toBe("collection_link");
  });

  it("confirms reference and empty-section cleanup while keeping other collections and URLs", async () => {
    const target = await collection(),
      parent = await collection(),
      child = await collection();
    await db.resource.create({
      data: {
        collectionId: parent.id,
        kind: "heading",
        titleOverride: "Only this collection",
        position: 0,
      },
    });
    expect((await link(parent.id, target.id, 1)).status).toBe(201);
    await db.resource.create({
      data: {
        collectionId: parent.id,
        kind: "heading",
        titleOverride: "Keep this section",
        position: 2,
      },
    });
    const ordinary = await db.resource.create({
      data: {
        collectionId: parent.id,
        kind: "external_link",
        url: `https://fixture-links.dev/c/${target.id}`,
        position: 3,
      },
    });
    expect((await link(target.id, child.id)).status).toBe(201);
    const impact = await preview(target.id);
    expect(impact.referenceCount).toBe(1);
    expect(impact.collections[0].removedSections.map((s: { title: string }) => s.title)).toEqual([
      "Only this collection",
    ]);
    await remove(target.id).expect(409);
    await remove(target.id, impact.token).expect(200);
    const remaining = await db.resource.findMany({
      where: { collectionId: parent.id },
      orderBy: { position: "asc" },
    });
    expect(remaining.map((r) => r.titleOverride ?? r.id)).toEqual([
      "Keep this section",
      ordinary.id,
    ]);
    expect(await db.collection.count({ where: { id: { in: [parent.id, child.id] } } })).toBe(2);
    expect(
      await db.auditLog.count({ where: { collectionId: parent.id, action: "item.removed" } }),
    ).toBe(2);
  });

  it("rejects a stale preview after a new reference or affected content change", async () => {
    const target = await collection(),
      parent = await collection();
    const empty = await preview(target.id);
    expect((await link(parent.id, target.id)).status).toBe(201);
    await remove(target.id, empty.token).expect(409);
    const populated = await preview(target.id);
    await db.collection.update({
      where: { id: parent.id },
      data: { title: "Renamed parent", version: { increment: 1 } },
    });
    await remove(target.id, populated.token).expect(409);
    const fresh = await preview(target.id);
    expect(fresh.collections[0].title).toBe("Renamed parent");
    await remove(target.id, fresh.token).expect(200);
  });

  it("transfers only after confirming incoming and outgoing reference cleanup", async () => {
    const target = await collection(),
      parent = await collection(),
      child = await collection();
    expect((await link(parent.id, target.id)).status).toBe(201);
    expect((await link(target.id, child.id)).status).toBe(201);
    const ordinary = await db.resource.create({
      data: {
        collectionId: target.id,
        kind: "external_link",
        url: "https://fixture-links.dev/keep",
        position: 1,
      },
    });
    await db.collectionShare.create({
      data: { collectionId: target.id, userId: other.id, role: "contributor", source: "direct" },
    });
    const impact = await preview(target.id, "transfer");
    expect(impact.referenceCount).toBe(2);
    const transfer = (impactToken?: string) =>
      api()
        .post(`/api/v1/collections/${target.id}/transfer`)
        .auth(owner.token, { type: "bearer" })
        .send({ email: otherEmail, impactToken });
    await transfer().expect(409);
    await transfer((await preview(target.id)).token).expect(409);
    await transfer(impact.token).expect(201);
    expect((await db.collection.findUniqueOrThrow({ where: { id: target.id } })).hubId).toBe(
      other.hubId,
    );
    expect(await db.resource.findUnique({ where: { id: ordinary.id } })).not.toBeNull();
    expect(
      await db.resource.count({
        where: { collectionId: { in: [parent.id, target.id] }, kind: "collection_link" },
      }),
    ).toBe(0);
    expect((await db.collection.findUniqueOrThrow({ where: { id: child.id } })).hubId).toBe(
      owner.hubId,
    );
  });

  it("rolls back deletion, references and sections if cleanup audit fails", async () => {
    const target = await collection(),
      parent = await collection();
    expect((await link(parent.id, target.id)).status).toBe(201);
    const impact = await preview(target.id);
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_reference_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'item.removed' THEN RAISE EXCEPTION 'audit fixture'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER reject_reference_cleanup BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_reference_cleanup()`,
    );
    try {
      await remove(target.id, impact.token).expect(500);
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER reject_reference_cleanup ON audit_logs");
      await db.$executeRawUnsafe("DROP FUNCTION reject_reference_cleanup()");
    }
    expect(await db.collection.findUnique({ where: { id: target.id } })).not.toBeNull();
    expect(
      await db.resource.count({
        where: { collectionId: parent.id, linkedCollectionId: target.id },
      }),
    ).toBe(1);
  });
});
