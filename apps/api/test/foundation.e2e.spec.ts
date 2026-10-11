import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { signInWithCode } from "./fixtures/sign-in";

// Phase A foundation conventions: error envelope, request IDs, cursor
// pagination (docs/exec-plans — foundation-conventions-phase-a).
describe("Foundation conventions (e2e)", () => {
  let app: INestApplication<App>;
  let bearer: string;
  let collectionId: string;

  const sfx = Date.now().toString(36);
  const username = `fnd_${sfx}`;

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

    const collection = await request(server)
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({
        title: "Fnd Collection",
        published: true,
      })
      .expect(201);
    collectionId = (collection.body as { data: { id: string } }).data.id;

    for (let position = 0; position < 3; position += 1) {
      await request(server)
        .post(`/api/v1/collections/${collectionId}/resources/external`)
        .set("Authorization", `Bearer ${bearer}`)
        .send({ url: `https://fixture-links.dev/fnd-${sfx}-${position}`, position })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it("attaches a server-generated request id to every response", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/health").expect(200);
    expect(res.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("returns the error envelope with matching request id on 404", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/definitely-not-a-route")
      .expect(404);

    const body = res.body as {
      error: {
        code: string;
        message: string;
        requestId: string;
        details: object;
      };
    };
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(body.error.requestId).toBe(res.headers["x-request-id"]);
    expect(body.error.details).toEqual({});
  });

  it("maps DTO validation failures to validation_failed with safe field/rule identifiers", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ title: "" })
      .expect(400);

    const body = res.body as {
      error: { code: string; details: { issues?: Array<{ field: string; rule: string }> } };
    };
    expect(body.error.code).toBe("validation_failed");
    expect(Array.isArray(body.error.details.issues)).toBe(true);
  });

  it("walks resources with cursor pagination, each item exactly once", async () => {
    const server = app.getHttpServer();

    const first = await request(server)
      .get(`/api/v1/collections/${collectionId}/resources?limit=2`)
      .expect(200);
    const firstBody = first.body as {
      data: Array<{ position: number }>;
      meta: { limit: number; nextCursor: string | null };
    };
    expect(firstBody.data.map((e) => e.position)).toEqual([0, 1]);
    expect(firstBody.meta.nextCursor).not.toBeNull();

    const second = await request(server)
      .get(
        `/api/v1/collections/${collectionId}/resources?limit=2&cursor=${encodeURIComponent(
          firstBody.meta.nextCursor as string,
        )}`,
      )
      .expect(200);
    const secondBody = second.body as {
      data: Array<{ position: number }>;
      meta: { nextCursor: string | null };
    };
    expect(secondBody.data.map((e) => e.position)).toEqual([2]);
    expect(secondBody.meta.nextCursor).toBeNull();
  });

  it("rejects a malformed cursor with the envelope", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/collections/${collectionId}/resources?cursor=%%%garbage`)
      .expect(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("invalid_cursor");
  });

  it("paginates the explore listing by cursor", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/discover?limit=1").expect(200);
    const body = res.body as {
      data: unknown[];
      meta: { limit: number; nextCursor: string | null };
    };
    expect(body.data.length).toBe(1);
    expect(body.meta.limit).toBe(1);
  });
});
