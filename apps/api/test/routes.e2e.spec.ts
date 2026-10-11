import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { signInWithCode } from "./fixtures/sign-in";

// Regression tests for route shadowing: a catch-all GET ':owner/:slug' under
// the collection routes used to swallow GET ':id/resources' and
// ':id/children'.
describe("Collection routes (e2e)", () => {
  let app: INestApplication<App>;
  let bearer: string;
  let collectionId: string;
  let hubId: string;

  const sfx = Date.now().toString(36);
  const username = `e2e_${sfx}`;
  const slug = `e2e-col-${sfx}`;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<INestApplication<App>>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();

    const server = app.getHttpServer();

    const signUp = await signInWithCode(server, {
      email: `${username}@example.com`,
      name: username,
    });
    bearer = signUp.headers["set-auth-token"];
    expect(bearer).toBeTruthy();

    const collection = await request(server)
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ title: "E2E Collection", published: true })
      .expect(201);
    const created = (collection.body as { data: { id: string; hubId: string } }).data;
    collectionId = created.id;
    hubId = created.hubId;

    await request(server)
      .post(`/api/v1/collections/${collectionId}/resources/external`)
      .set("Authorization", `Bearer ${bearer}`)
      .send({ url: `https://fixture-links.dev/e2e-${sfx}`, position: 0 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it("lists resources of a published collection unauthenticated", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/collections/${collectionId}/resources`)
      .expect(200);

    const body = res.body as { data: Array<{ url?: string }> };
    expect(body.data.length).toBe(1);
    expect(body.data[0].url).toContain(`e2e-${sfx}`);
  });

  // Canary for the shadowing regressing: a non-uuid id must be rejected by
  // the resources controller's ParseUUIDPipe (400), not swallowed by another
  // route as a 404.
  it("rejects a non-uuid collection id on the resources route with 400", async () => {
    await request(app.getHttpServer()).get("/api/v1/collections/not-a-uuid/resources").expect(400);
  });

  it("has no structural children route", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${collectionId}/children`)
      .expect(404);
  });

  it("removes hub/slug lookups without aliases", async () => {
    await request(app.getHttpServer()).get(`/api/v1/hubs/${hubId}/collections/${slug}`).expect(404);
  });
  it("looks up a collection by its immutable id (survives a title rename)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/collections/${collectionId}`)
      .expect(200);
    expect((res.body as { data: { id: string } }).data.id).toBe(collectionId);

    const current = (res.body as { data: { version: number } }).data.version;
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${collectionId}`)
      .set("Authorization", `Bearer ${bearer}`)
      .send({ version: current, title: `Renamed ${sfx}` })
      .expect(200);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/collections/${collectionId}`)
      .expect(200);
    expect(after.body.data).toMatchObject({ id: collectionId, title: `Renamed ${sfx}` });
    expect(after.body.data).not.toHaveProperty("slug");
  });

  it("allows duplicate titles and rejects retired slug input", async () => {
    const create = () =>
      request(app.getHttpServer()).post("/api/v1/collections").auth(bearer, { type: "bearer" });
    const a = (await create().send({ title: "Same title" }).expect(201)).body.data;
    const b = (await create().send({ title: "Same title" }).expect(201)).body.data;
    expect(a.id).not.toBe(b.id);
    expect(a).not.toHaveProperty("slug");
    await create().send({ title: "Same title", slug: "retired" }).expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${a.id}`)
      .auth(bearer, { type: "bearer" })
      .send({ version: a.version, slug: "retired" })
      .expect(400);
  });

  it("hides an unpublished collection id from anonymous readers with 404", async () => {
    const priv = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ published: false, title: "Private" })
      .expect(201);
    const privId = (priv.body as { data: { id: string } }).data.id;

    await request(app.getHttpServer()).get(`/api/v1/collections/${privId}`).expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${privId}`)
      .set("Authorization", `Bearer ${bearer}`)
      .expect(200);
  });

  it("resolves a hub page by handle (backs /@handle URLs)", async () => {
    const profile = await request(app.getHttpServer())
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${bearer}`)
      .expect(200);
    const handle = (profile.body as { data: { handle: string } }).data.handle;

    const res = await request(app.getHttpServer())
      .get(`/api/v1/hubs/by-handle/${handle}`)
      .expect(200);
    const body = res.body as { data: { hub: { id: string; handle: string } } };
    expect(body.data.hub.id).toBe(hubId);
    expect(body.data.hub.handle).toBe(handle);

    await request(app.getHttpServer()).get("/api/v1/hubs/by-handle/no-such-handle").expect(404);
  });

  it("no longer exposes the username lookup route", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/users/${username}/collections/${slug}`)
      .expect(404);
  });
});
