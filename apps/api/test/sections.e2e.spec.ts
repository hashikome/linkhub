import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("section context and membership", () => {
  let app: INestApplication, db: PrismaService;
  const api = () => request(app.getHttpServer());
  async function person() {
    const email = `sections-${randomUUID()}@example.com`;
    const signed = await signInWithCode(app.getHttpServer(), { email, name: "Section reader" });
    return {
      email,
      token: signed.headers["set-auth-token"] as string,
      id: signed.body.user.id as string,
    };
  }
  async function collection(token: string) {
    return (
      await api()
        .post("/api/v1/collections")
        .auth(token, { type: "bearer" })
        .send({ title: "A sectioned guide", published: true })
        .expect(201)
    ).body.data;
  }
  async function link(id: string, token: string, position: number) {
    return (
      await api()
        .post(`/api/v1/collections/${id}/resources/external`)
        .auth(token, { type: "bearer" })
        .send({ url: `https://fixture-links.dev/section-${randomUUID()}`, position })
        .expect(201)
    ).body.data;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
  });
  beforeEach(async () => {
    await db.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  it("authors bounded plain-text section context with collection permissions and versions", async () => {
    const owner = await person(),
      contributor = await person(),
      viewer = await person();
    const c = await collection(owner.token),
      first = await link(c.id, owner.token, 0);
    for (const [actor, role] of [
      [contributor, "contributor"],
      [viewer, "viewer"],
    ] as const)
      await api()
        .post(`/api/v1/collections/${c.id}/shares`)
        .auth(owner.token, { type: "bearer" })
        .send({ email: actor.email, role })
        .expect(201);
    const body = {
      title: "  Start here  ",
      description: "  Read <carefully>.\nThen explore.  ",
      firstItemId: first.id,
      firstItemVersion: first.version,
    };
    const create = (token: string, value: object) =>
      api()
        .post(`/api/v1/collections/${c.id}/resources/heading`)
        .auth(token, { type: "bearer" })
        .send(value);
    await create(viewer.token, body).expect(403);
    const section = (await create(contributor.token, body).expect(201)).body.data;
    expect(section).toMatchObject({
      title: "Start here",
      description: "Read <carefully>.\nThen explore.",
      position: 0,
      kind: "heading",
    });
    expect(await db.hub.count({ where: { ownerUserId: contributor.id } })).toBe(0);
    const moved = await db.resource.findUniqueOrThrow({ where: { id: first.id } });
    expect(moved.position).toBe(1);
    expect(Number(moved.version)).toBe(2);
    const patch = (token: string, id: string, value: object) =>
      api()
        .patch(`/api/v1/collections/${c.id}/resources/${id}`)
        .auth(token, { type: "bearer" })
        .send(value);
    await patch(viewer.token, section.id, { version: 1, description: "No" }).expect(403);
    for (const description of ["x".repeat(501), null, 42])
      await patch(contributor.token, section.id, { version: 1, description }).expect(400);
    await patch(owner.token, first.id, { version: 2, description: "Not link metadata" }).expect(
      400,
    );
    const saved = await patch(contributor.token, section.id, {
      version: 1,
      description: "x".repeat(500),
    }).expect(200);
    expect(saved.body.data.description).toHaveLength(500);
    await patch(owner.token, section.id, { version: 1, description: "Stale" }).expect(409);
    const cleared = await patch(owner.token, section.id, {
      version: saved.body.data.version,
      description: " \n ",
    }).expect(200);
    expect(cleared.body.data.description).toBeNull();
    await patch(owner.token, section.id, {
      version: cleared.body.data.version,
      title: "Changed",
    }).expect(400);
  });

  it("rejects empty sections and rolls back deletion, movement and reorder of the last item", async () => {
    const owner = await person(),
      c = await collection(owner.token);
    const base = `/api/v1/collections/${c.id}/resources`;
    const first = await link(c.id, owner.token, 0);
    const create = (value: object) =>
      api().post(`${base}/heading`).auth(owner.token, { type: "bearer" }).send(value);
    await create({ title: "Empty", firstItemId: randomUUID(), firstItemVersion: 1 }).expect(400);
    const section = (
      await create({ title: "Start", firstItemId: first.id, firstItemVersion: 1 }).expect(201)
    ).body.data;
    const snapshot = () =>
      db.resource.findMany({ where: { collectionId: c.id }, orderBy: { position: "asc" } });
    const before = await snapshot();
    const evidence = await db.auditLog.count({ where: { collectionId: c.id } });
    await create({ title: "Empty previous", firstItemId: first.id, firstItemVersion: 2 }).expect(
      409,
    );
    await api().delete(`${base}/${first.id}`).auth(owner.token, { type: "bearer" }).expect(409);
    await api()
      .patch(`${base}/${section.id}`)
      .auth(owner.token, { type: "bearer" })
      .send({ version: 1, position: 2 })
      .expect(409);
    await api()
      .patch(`${base}/reorder`)
      .auth(owner.token, { type: "bearer" })
      .send({
        items: [
          { resourceId: first.id, position: 0, version: 2 },
          { resourceId: section.id, position: 1, version: 1 },
        ],
      })
      .expect(409);
    expect(await snapshot()).toEqual(before);
    expect(await db.auditLog.count({ where: { collectionId: c.id } })).toBe(evidence);
    const other = await collection(owner.token);
    const reference = (
      await api()
        .post(`${base}/collection`)
        .auth(owner.token, { type: "bearer" })
        .send({ linkedCollectionId: other.id, position: 2 })
        .expect(201)
    ).body.data;
    await api().delete(`${base}/${first.id}`).auth(owner.token, { type: "bearer" }).expect(200);
    expect((await snapshot()).map((row) => row.id)).toEqual([section.id, reference.id]);
    await api().delete(`${base}/${section.id}`).auth(owner.token, { type: "bearer" }).expect(200);
    expect((await snapshot()).map((row) => row.id)).toEqual([reference.id]);
  });

  it("carries section context through item pagination without repeating resources", async () => {
    const owner = await person(),
      c = await collection(owner.token);
    const one = await link(c.id, owner.token, 0),
      two = await link(c.id, owner.token, 1);
    const section = (
      await api()
        .post(`/api/v1/collections/${c.id}/resources/heading`)
        .auth(owner.token, { type: "bearer" })
        .send({
          title: "Context",
          description: "Always available",
          firstItemId: one.id,
          firstItemVersion: 1,
        })
        .expect(201)
    ).body.data;
    const path = `/api/v1/collections/${c.id}/resources`;
    let page = await api().get(path).query({ limit: 1 }).expect(200);
    expect(page.body.data.map((row: { id: string }) => row.id)).toEqual([section.id]);
    expect(page.body.meta.section).toBeUndefined();
    for (const item of [one, two]) {
      page = await api()
        .get(path)
        .query({ limit: 1, cursor: page.body.meta.nextCursor })
        .expect(200);
      expect(page.body.data.map((row: { id: string }) => row.id)).toEqual([item.id]);
      expect(page.body.meta.section).toMatchObject({
        id: section.id,
        title: "Context",
        description: "Always available",
      });
    }
    expect(page.body.meta.nextCursor).toBeNull();
    await api()
      .post(`/api/v1/collections/${c.id}/unpublish`)
      .auth(owner.token, { type: "bearer" })
      .expect(201);
    await api().get(path).expect(404);
  });
  it("reorders sparse positions, advances versions, and rejects stale full snapshots", async () => {
    const owner = await person(),
      c = await collection(owner.token);
    const one = await link(c.id, owner.token, 1026),
      two = await link(c.id, owner.token, 9000);
    const body = {
      items: [
        { resourceId: two.id, position: 0, version: 1 },
        { resourceId: one.id, position: 1, version: 1 },
      ],
    };
    const reorder = () =>
      api()
        .patch(`/api/v1/collections/${c.id}/resources/reorder`)
        .auth(owner.token, { type: "bearer" })
        .send(body);
    await reorder().expect(200);
    const rows = await db.resource.findMany({
      where: { collectionId: c.id },
      orderBy: { position: "asc" },
    });
    expect(rows.map((row) => [row.id, row.position, Number(row.version)])).toEqual([
      [two.id, 0, 2],
      [one.id, 1, 2],
    ]);
    await reorder().expect(409);
  });

  it("moves section blocks and individual items with permission, version and nonempty checks", async () => {
    const owner = await person(),
      contributor = await person(),
      viewer = await person();
    const c = await collection(owner.token),
      base = `/api/v1/collections/${c.id}/resources`;
    const one = await link(c.id, owner.token, 0),
      two = await link(c.id, owner.token, 1),
      three = await link(c.id, owner.token, 2);
    const heading = (title: string, firstItemId: string, firstItemVersion: number) =>
      api()
        .post(`${base}/heading`)
        .auth(owner.token, { type: "bearer" })
        .send({ title, firstItemId, firstItemVersion })
        .expect(201);
    const first = (await heading("First", one.id, 1)).body.data;
    const second = (await heading("Second", three.id, 2)).body.data;
    for (const [actor, role] of [
      [contributor, "contributor"],
      [viewer, "viewer"],
    ] as const)
      await api()
        .post(`/api/v1/collections/${c.id}/shares`)
        .auth(owner.token, { type: "bearer" })
        .send({ email: actor.email, role })
        .expect(201);
    const rows = () =>
      db.resource.findMany({ where: { collectionId: c.id }, orderBy: { position: "asc" } });
    const move = (token: string, id: string, body: object) =>
      api().patch(`${base}/${id}/move`).auth(token, { type: "bearer" }).send(body);
    await move(viewer.token, first.id, { version: 1, direction: "down" }).expect(403);
    await move(contributor.token, first.id, { version: 1, direction: "down" }).expect(200);
    expect((await rows()).map((row) => row.id)).toEqual([
      second.id,
      three.id,
      first.id,
      one.id,
      two.id,
    ]);
    await move(owner.token, first.id, { version: 1, direction: "up" }).expect(409);
    const before = await rows();
    const source = before.find((row) => row.id === three.id);
    if (!source) throw new Error("Missing source");
    await move(owner.token, three.id, {
      version: Number(source.version),
      beforeId: two.id,
      beforeVersion: Number(before.find((row) => row.id === two.id)?.version),
    }).expect(409);
    expect(await rows()).toEqual(before);
    const moving = before.find((row) => row.id === two.id);
    if (!moving) throw new Error("Missing moving item");
    await move(contributor.token, moving.id, {
      version: Number(moving.version),
      beforeId: three.id,
      beforeVersion: Number(source.version),
    }).expect(200);
    expect((await rows()).map((row) => row.id)).toEqual([
      second.id,
      two.id,
      three.id,
      first.id,
      one.id,
    ]);
    const current = (await rows()).find((row) => row.id === one.id);
    if (!current) throw new Error("Missing current item");
    await move(owner.token, one.id, {
      version: Number(current.version),
      beforeId: randomUUID(),
      beforeVersion: 1,
    }).expect(400);
    await move(owner.token, one.id, {
      version: Number(current.version),
      direction: "up",
      beforeId: two.id,
      beforeVersion: 1,
    }).expect(400);
    await move(owner.token, one.id, { version: Number(current.version), beforeId: two.id }).expect(
      400,
    );
    await move(owner.token, randomUUID(), { version: 1, direction: "up" }).expect(404);
  });
});
