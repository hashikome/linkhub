import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("collaborators and single-item reads", () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let owner: { token: string; id: string; email: string };
  let viewer: typeof owner;
  let contributor: typeof owner;
  let source: string;
  let target: string;
  let item: string;
  let reference: string;
  const api = () => request(app.getHttpServer());
  const path = () => `/api/v1/collections/${source}`;
  const read = (id = item) => api().get(`${path()}/resources/${id}`);
  const grant = (email: string, role?: string) =>
    api()
      .post(`${path()}/shares`)
      .auth(owner.token, { type: "bearer" })
      .send({ email, ...(role ? { role } : {}) });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<INestApplication<App>>({ bodyParser: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const login = async (name: string) => {
      const email = `item-${name}-${crypto.randomUUID()}@example.com`;
      const response = await signInWithCode(app.getHttpServer(), { email, name });
      return {
        token: response.headers["set-auth-token"] as string,
        id: response.body.user.id as string,
        email,
      };
    };
    owner = await login("owner");
    viewer = await login("viewer");
    contributor = await login("contributor");
    const create = async (slug: string) =>
      (
        await api()
          .post("/api/v1/collections")
          .auth(owner.token, { type: "bearer" })
          .send({ title: slug, slug })
          .expect(201)
      ).body.data.id as string;
    source = await create("source-items");
    target = await create("secret-target");
    await db.resource.createMany({
      data: Array.from({ length: 22 }, (_, position) => ({
        collectionId: source,
        kind: "heading",
        titleOverride: `Section ${position}`,
        position,
        addedByUserId: owner.id,
      })),
    });
    item = (
      await db.resource.findUniqueOrThrow({
        where: { collectionId_position: { collectionId: source, position: 21 } },
      })
    ).id;
    reference = (
      await api()
        .post(`${path()}/resources/collection`)
        .auth(owner.token, { type: "bearer" })
        .send({ linkedCollectionId: target, position: 22 })
        .expect(201)
    ).body.data.id;
  });
  beforeEach(async () => {
    await db.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  it("defaults to viewer, accepts contributor and refuses retired role identifiers", async () => {
    for (const role of ["reader", "editor", "owner", "admin"])
      await grant(viewer.email, role).expect(400);
    expect((await grant(viewer.email).expect(201)).body.data.role).toBe("viewer");
    expect((await grant(contributor.email, "contributor").expect(201)).body.data.role).toBe(
      "contributor",
    );
    const transfer = await api()
      .post(`${path()}/transfer`)
      .auth(owner.token, { type: "bearer" })
      .send({ email: viewer.email })
      .expect(400);
    expect(transfer.body.error.code).toBe("transfer_requires_contributor");
    const shares = (
      await api().get(`${path()}/shares`).auth(owner.token, { type: "bearer" }).expect(200)
    ).body.data;
    expect(shares.map((s: { role: string }) => s.role).sort()).toEqual(["contributor", "viewer"]);
    expect(
      await db.hub.count({ where: { ownerUserId: { in: [viewer.id, contributor.id] } } }),
    ).toBe(0);
    await read().auth(viewer.token, { type: "bearer" }).expect(200);
    await api()
      .patch(`${path()}/resources/${item}`)
      .auth(viewer.token, { type: "bearer" })
      .send({ version: 1, tags: ["denied"] })
      .expect(403);
    await api()
      .patch(`${path()}/resources/${item}`)
      .auth(contributor.token, { type: "bearer" })
      .send({ version: 1, tags: ["allowed"] })
      .expect(200);
    for (const action of ["publish", "unpublish"])
      await api()
        .post(`${path()}/${action}`)
        .auth(contributor.token, { type: "bearer" })
        .expect(403);
    await api()
      .post(`${path()}/shares`)
      .auth(contributor.token, { type: "bearer" })
      .send({ email: viewer.email, role: "contributor" })
      .expect(403);
    await api().delete(path()).auth(contributor.token, { type: "bearer" }).expect(403);
    await api()
      .get(`/api/v1/collections/${target}`)
      .auth(contributor.token, { type: "bearer" })
      .expect(404);
    const effect = await db.auditLog.findFirstOrThrow({
      where: { collectionId: source, action: "share.granted", targetUserId: contributor.id },
    });
    expect(effect.role).toBe("contributor");
    expect(effect.afterState).toBe("direct_contributor");
  });

  it("reads beyond pagination and hides foreign, missing and inaccessible items", async () => {
    const first = (
      await api().get(`${path()}/resources`).auth(owner.token, { type: "bearer" }).expect(200)
    ).body.data;
    expect(first.map((r: { id: string }) => r.id)).not.toContain(item);
    const data = (await read().auth(owner.token, { type: "bearer" }).expect(200)).body.data;
    expect(data.title).toBe("Section 21");
    expect(data.addedBy.userId).toBe(owner.id);
    await read().expect(404);
    await read(crypto.randomUUID()).auth(owner.token, { type: "bearer" }).expect(404);
    await read("bad-id").auth(owner.token, { type: "bearer" }).expect(400);
    await api()
      .get(`/api/v1/collections/${target}/resources/${item}`)
      .auth(owner.token, { type: "bearer" })
      .expect(404);
    await db.operatorGrant.create({ data: { userId: viewer.id, authority: "test" } });
    await api()
      .delete(`${path()}/shares/${viewer.id}`)
      .auth(owner.token, { type: "bearer" })
      .expect(200);
    await read().auth(viewer.token, { type: "bearer" }).expect(404);
  });

  it("rechecks link rotation, publication, holds and target access independently", async () => {
    const enable = async () =>
      (
        await api()
          .put(`${path()}/link-sharing`)
          .auth(owner.token, { type: "bearer" })
          .send({ enabled: true, rotate: true })
          .expect(200)
      ).body.data.token as string;
    const token = await enable();
    await read().query({ s: token }).expect(200);
    const hidden = (await read(reference).set("x-share-token", token).expect(200)).body.data;
    expect(hidden.title).toBeNull();
    expect(hidden.linkedCollectionId).toBeNull();
    expect(hidden.linkedCollection).toBeNull();
    expect(
      (await read(reference).auth(owner.token, { type: "bearer" }).expect(200)).body.data
        .linkedCollection.id,
    ).toBe(target);
    await enable();
    await read().query({ s: token }).expect(404);
    await api().post(`${path()}/publish`).auth(owner.token, { type: "bearer" }).expect(201);
    await read().expect(200);
    await db.collectionHold.create({
      data: { collectionId: source, actorUserId: viewer.id, reason: "spam" },
    });
    await read().expect(404);
    await read().auth(contributor.token, { type: "bearer" }).expect(404);
    await read().auth(owner.token, { type: "bearer" }).expect(200);
    await db.collectionHold.delete({ where: { collectionId: source } });
    await db.resource.delete({ where: { id: item } });
    await read().expect(404);
    await db.user.update({ where: { id: owner.id }, data: { accountState: "inactive" } });
    await read(reference).expect(404);
  });
});
