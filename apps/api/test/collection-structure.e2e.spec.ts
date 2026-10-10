import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("Independent collection resources (e2e)", () => {
  let app: INestApplication<App>;
  const sfx = Date.now().toString(36);

  const signUp = async (label: string) => {
    const res = await signInWithCode(app.getHttpServer(), {
      email: `${label}_${sfx}@example.com`,
      name: label,
    });
    return res.headers["set-auth-token"] as string;
  };

  const createCollection = async (bearer: string, slug: string) => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ slug, title: slug })
      .expect(201);
    return (res.body as { data: { id: string } }).data.id;
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const link = (token: string, source: string, target: string, position = 0) =>
    request(app.getHttpServer())
      .post(`/api/v1/collections/${source}/resources/collection`)
      .auth(token, { type: "bearer" })
      .send({ linkedCollectionId: target, position });

  it("allows reuse and cycles, and deleting a source never deletes destinations", async () => {
    const alice = await signUp("independent");
    const a = await createCollection(alice, "alpha");
    const b = await createCollection(alice, "beta");
    const c = await createCollection(alice, "gamma");
    await link(alice, a, b).expect(201);
    await link(alice, c, b).expect(201);
    await link(alice, b, a).expect(201);
    await link(alice, a, b, 1).expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/collections/${a}`)
      .auth(alice, { type: "bearer" })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${b}`)
      .auth(alice, { type: "bearer" })
      .expect(200);
    const refs = await request(app.getHttpServer())
      .get(`/api/v1/collections/${b}/resources`)
      .auth(alice, { type: "bearer" })
      .expect(200);
    expect(refs.body.data[0]).toMatchObject({
      kind: "collection_link",
      linkedCollectionId: null,
      linkedCollection: null,
    });
  });

  it("authorizes cross-hub targets separately and lets editors manage only the reference", async () => {
    const alice = await signUp("reference-owner"),
      bob = await signUp("reference-editor");
    const a = await createCollection(alice, "source"),
      b = await createCollection(bob, "destination");
    await link(alice, a, b).expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${b}/publish`)
      .auth(bob, { type: "bearer" })
      .expect(201);
    const added = await link(alice, a, b).expect(201);
    expect(added.body.data.linkedCollection.title).toBe("destination");
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${b}/unpublish`)
      .auth(bob, { type: "bearer" })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${a}/resources/${added.body.data.id}`)
      .auth(alice, { type: "bearer" })
      .send({ titleOverride: "My label", version: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${a}/resources/${added.body.data.id}`)
      .auth(alice, { type: "bearer" })
      .send({ tags: ["mine"], version: 1 })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/collections/${a}/resources/${added.body.data.id}`)
      .auth(alice, { type: "bearer" })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${b}`)
      .auth(bob, { type: "bearer" })
      .expect(200);
  });

  it("never inherits reader/editor, publication or link-token access", async () => {
    const alice = await signUp("isolated-owner"),
      bob = await signUp("isolated-editor");
    const a = await createCollection(alice, "shared-source"),
      b = await createCollection(alice, "private-target");
    const reference = await link(alice, a, b).expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${a}/shares`)
      .auth(alice, { type: "bearer" })
      .send({ email: `isolated-editor_${sfx}@example.com`, role: "contributor" })
      .expect(201);
    const shares = await request(app.getHttpServer())
      .get(`/api/v1/collections/${a}/resources`)
      .auth(bob, { type: "bearer" })
      .expect(200);
    expect(shares.body.data[0].linkedCollection).toBeNull();
    expect(JSON.stringify(shares.body)).not.toContain("private-target");
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${b}`)
      .auth(bob, { type: "bearer" })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${b}/resources/external`)
      .auth(bob, { type: "bearer" })
      .send({ url: "https://fixture-links.dev/forbidden", position: 0 })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${a}/resources/reorder`)
      .auth(bob, { type: "bearer" })
      .send({ items: [{ resourceId: reference.body.data.id, position: 0, version: 1 }] })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${a}/publish`)
      .auth(alice, { type: "bearer" })
      .expect(201);
    await request(app.getHttpServer()).get(`/api/v1/collections/${b}`).expect(404);
    const shared = await request(app.getHttpServer())
      .put(`/api/v1/collections/${a}/link-sharing`)
      .auth(alice, { type: "bearer" })
      .send({ enabled: true })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${b}?s=${shared.body.data.token}`)
      .expect(404);
  });

  it("sends no stored title or id for a reference the reader cannot open", async () => {
    const owner = await signUp("leak-owner");
    const source = await createCollection(owner, `leak-source-${sfx}`);
    const target = await createCollection(owner, `leak-target-${sfx}`);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${source}/resources/collection`)
      .auth(owner, { type: "bearer" })
      .send({ linkedCollectionId: target, position: 0 })
      .expect(201);
    // Titles of links and references are resolved, never inputs.
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${source}/resources/collection`)
      .auth(owner, { type: "bearer" })
      .send({ linkedCollectionId: target, position: 1, titleOverride: "Typed" })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${source}/resources/external`)
      .auth(owner, { type: "bearer" })
      .send({ url: "https://fixture-links.dev/typed", position: 1, titleOverride: "Typed" })
      .expect(400);
    // Rows saved by the removed nesting feature copied the target's title; a
    // reference's title is always its readable target's, never a stored copy.
    await app.get(PrismaService).resource.updateMany({
      where: { collectionId: source },
      data: { titleOverride: "Q3 private plan" },
    });
    const current = await request(app.getHttpServer())
      .get(`/api/v1/collections/${source}`)
      .auth(owner, { type: "bearer" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${source}`)
      .auth(owner, { type: "bearer" })
      .send({ published: true, version: current.body.data.version })
      .expect(200);
    const anonymous = await request(app.getHttpServer())
      .get(`/api/v1/collections/${source}/resources`)
      .expect(200);
    expect(anonymous.body.data[0]).toMatchObject({
      kind: "collection_link",
      linkedCollection: null,
      linkedCollectionId: null,
      title: null,
    });
    expect(JSON.stringify(anonymous.body)).not.toContain("Q3 private plan");
    expect(JSON.stringify(anonymous.body)).not.toContain(target);
    const ownView = await request(app.getHttpServer())
      .get(`/api/v1/collections/${source}/resources`)
      .auth(owner, { type: "bearer" })
      .expect(200);
    expect(ownView.body.data[0]).toMatchObject({ linkedCollectionId: target });
    expect(ownView.body.data[0].title).toBe(ownView.body.data[0].linkedCollection.title);
    expect(JSON.stringify(ownView.body)).not.toContain("Q3 private plan");
  });

  it("stores headings as ordered editable resources without creating collections", async () => {
    const token = await signUp("heading-owner");
    const id = await createCollection(token, "heading-guide");
    const route = `/api/v1/collections/${id}/resources/heading`;
    const first = await request(app.getHttpServer())
      .post(`/api/v1/collections/${id}/resources/external`)
      .auth(token, { type: "bearer" })
      .send({ url: "https://fixture-links.dev/section-start", position: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .post(route)
      .auth(token, { type: "bearer" })
      .send({ title: "   ", position: 0 })
      .expect(400);
    const heading = await request(app.getHttpServer())
      .post(route)
      .auth(token, { type: "bearer" })
      .send({
        title: "Getting started",
        firstItemId: first.body.data.id,
        firstItemVersion: first.body.data.version,
      })
      .expect(201);
    expect(heading.body.data).toMatchObject({
      kind: "heading",
      title: "Getting started",
      linkedCollectionId: null,
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${id}/resources/${heading.body.data.id}`)
      .auth(token, { type: "bearer" })
      .send({ titleOverride: "Next steps", version: 1 })
      .expect(400);
    // A heading's text is fixed once added; only tags and position change.
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${id}/resources/${heading.body.data.id}`)
      .auth(token, { type: "bearer" })
      .send({ tags: ["intro"], version: 1 })
      .expect(200);
  });
});
