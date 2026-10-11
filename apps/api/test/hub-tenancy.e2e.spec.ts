import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { signInWithCode } from "./fixtures/sign-in";

// First collection creation establishes hub ownership atomically.
describe("Hub tenancy (e2e)", () => {
  let app: INestApplication<App>;
  let ownerBearer: string;
  const sfx = Date.now().toString(36);
  const owner = `hub_${sfx}`;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();

    const signUp = await signInWithCode(app.getHttpServer(), {
      email: `${owner}@example.com`,
      name: owner,
    });
    ownerBearer = signUp.headers["set-auth-token"];
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates the personal hub with the first collection", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${ownerBearer}`)
      .send({ slug: `unpub-${sfx}`, title: "Unpublished", published: false })
      .expect(201);
    const body = res.body as { data: { hubId: string; published: boolean } };
    expect(body.data.hubId).toBeTruthy();
    expect(body.data.published).toBe(false);
  });

  it("hides an unpublished collection from strangers but serves it via share token", async () => {
    const server = app.getHttpServer();

    const created = await request(server)
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${ownerBearer}`)
      .send({ slug: `secret-${sfx}`, title: "Secret", published: false })
      .expect(201);
    const collectionId = (created.body as { data: { id: string } }).data.id;

    await request(server)
      .post(`/api/v1/collections/${collectionId}/resources/external`)
      .set("Authorization", `Bearer ${ownerBearer}`)
      .send({ url: `https://fixture-links.dev/secret-${sfx}`, position: 0 })
      .expect(201);

    // Stranger cannot read an unpublished collection (404: cannot know it exists).
    await request(server).get(`/api/v1/collections/${collectionId}/resources`).expect(404);

    // Owner enables link sharing and shares the minted token.
    const share = await request(server)
      .put(`/api/v1/collections/${collectionId}/link-sharing`)
      .set("Authorization", `Bearer ${ownerBearer}`)
      .send({ enabled: true })
      .expect(200);
    const token = (share.body as { data: { token: string } }).data.token;

    // Anyone with the token can now read it.
    const viaToken = await request(server)
      .get(`/api/v1/collections/${collectionId}/resources?s=${token}`)
      .expect(200);
    expect((viaToken.body as { data: unknown[] }).data.length).toBe(1);

    // A wrong token is rejected.
    await request(server).get(`/api/v1/collections/${collectionId}/resources?s=wrong`).expect(404);
  });

  it("lists a published collection on the public explore listing", async () => {
    const server = app.getHttpServer();
    const slug = `pub-${sfx}`;

    await request(server)
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${ownerBearer}`)
      .send({ slug, title: "Published", published: true })
      .expect(201);

    const res = await request(server).get("/api/v1/discover?limit=50").expect(200);
    const body = res.body as { data: Array<{ slug: string }> };
    expect(body.data.some((c) => c.slug === slug)).toBe(true);
  });
});
