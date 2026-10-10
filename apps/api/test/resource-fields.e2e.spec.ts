import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { signInWithCode } from "./fixtures/sign-in";

// Resources keep their own URLs and expose normalized names from tag relations.
describe("Resource + tag fields (e2e)", () => {
  let app: INestApplication<App>;
  let bearer: string;
  const sfx = Date.now().toString(36);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>({ bodyParser: false });
    configureApp(app);
    await app.init();
    const signUp = await signInWithCode(app.getHttpServer(), {
      email: `rf_${sfx}@example.com`,
      name: `rf ${sfx}`,
    });
    bearer = signUp.headers["set-auth-token"];
  });

  afterAll(async () => {
    await app.close();
  });

  it("stores a url on the resource and normalizes tags (relational storage)", async () => {
    // Empty collections start without tags.
    const collection = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ slug: `rf-col-${sfx}`, title: "RF" })
      .expect(201);
    const cid = (collection.body as { data: { id: string; tags: string[] } }).data.id;
    expect((collection.body as { data: { tags: string[] } }).data.tags).toEqual([]);

    // A resource carries its own url and its own normalized tags.
    const resource = await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/resources/external`)
      .set("Authorization", `Bearer ${bearer}`)
      .send({
        url: `https://fixture-links.dev/rf-${sfx}`,
        position: 0,
        tags: ["Video", "VIDEO", "free"],
      })
      .expect(201);
    const body = resource.body as { data: { url: string; tags: string[] } };
    expect(body.data.url).toBe(`https://fixture-links.dev/rf-${sfx}`);
    expect(body.data.tags).toEqual(["video", "free"]);

    // The same url cannot be added twice to one collection.
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/resources/external`)
      .set("Authorization", `Bearer ${bearer}`)
      .send({ url: `https://fixture-links.dev/rf-${sfx}`, position: 1 })
      .expect(409);
  });
});
