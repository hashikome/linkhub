import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { GravatarService } from "../src/modules/avatars/gravatar.service";
import { signInWithCode } from "./fixtures/sign-in";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQS5n2HwAD1AIY4wETJQAAAABJRU5ErkJggg==",
  "base64",
);
const resolveAvatar = mock(async (email: string) =>
  email.startsWith("avatar-hit-") ? { body: png, contentType: "image/png" } : null,
);
let app: INestApplication;
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GravatarService)
    .useValue({ resolve: resolveAvatar })
    .compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
});
afterAll(async () => {
  await app?.close();
});

describe("public generated avatar HTTP contract", () => {
  const path = "/api/v1/avatars/user-1.svg";
  it("serves safe immutable SVGs with validated dimensions", async () => {
    for (const size of [undefined, 16, 128, 512]) {
      const result = await request(app.getHttpServer())
        .get(path + (size === undefined ? "" : `?size=${size}`))
        .expect(200);
      expect(result.headers["content-type"]).toBe("image/svg+xml; charset=utf-8");
      expect(result.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      expect(result.headers["x-content-type-options"]).toBe("nosniff");
      expect(result.headers["content-security-policy"]).toContain("sandbox");
      const svg = Buffer.isBuffer(result.body) ? result.body.toString() : result.text;
      expect(svg).toContain(`width="${size ?? 64}" height="${size ?? 64}"`);
      expect(svg).toContain('viewBox="0 0 40 40"');
      expect(svg).not.toContain("user-1");
    }
  });

  it("rejects malformed seeds and query input without cacheable errors", async () => {
    for (const seed of ["bad%20seed", "bad%40seed", "%3Csvg%3E", "x".repeat(129)]) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/avatars/${seed}.svg`)
        .expect(400);
      expect(response.headers["cache-control"]).toContain("no-store");
    }
    await request(app.getHttpServer()).get("/api/v1/avatars/.svg").expect(400);
    for (const query of [
      "size=",
      "size=15",
      "size=513",
      "size=1.5",
      "size=no",
      "size=1e2",
      "size=64&size=128",
      "unexpected=yes",
    ]) {
      await request(app.getHttpServer()).get(`${path}?${query}`).expect(400);
    }
  });

  it("supports conditional GET/HEAD without confusing seeds or sizes", async () => {
    const initial = await request(app.getHttpServer()).get(path).expect(200);
    const etag = initial.headers.etag;
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    for (const value of [etag, `W/${etag}`, `"different", ${etag}`, "*"]) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set("If-None-Match", value)
        .expect(304);
      expect(response.headers.etag).toBe(etag);
      expect(response.headers["cache-control"]).toContain("immutable");
      expect(response.text ?? "").toBe("");
    }
    await request(app.getHttpServer()).head(path).set("If-None-Match", etag).expect(304);
    for (const other of [`${path}?size=128`, "/api/v1/avatars/user-2.svg"]) {
      const response = await request(app.getHttpServer())
        .get(other)
        .set("If-None-Match", etag)
        .expect(200);
      expect(response.headers.etag).not.toBe(etag);
    }
  });

  it("redirects UUIDs without requiring or revealing a user record", async () => {
    const id = "01923456-789a-7bcd-8ef0-123456789abc";
    const response = await request(app.getHttpServer())
      .get(`/api/v1/users/${id}/avatar`)
      .expect(302);
    expect(response.headers.location).toBe(`/api/v1/avatars/${id}.svg`);
    expect(response.headers["cache-control"]).toContain("no-store");
    await request(app.getHttpServer()).get("/api/v1/users/not-a-uuid/avatar").expect(400);
  });
});

describe("public account avatar HTTP resolution", () => {
  it("serves the same proxied Gravatar to every viewer and ignores chosen-image priority", async () => {
    const email = `avatar-hit-${crypto.randomUUID()}@example.com`;
    const login = await signInWithCode(app.getHttpServer(), { email });
    const other = await signInWithCode(app.getHttpServer(), {
      email: `avatar-viewer-${crypto.randomUUID()}@example.com`,
    });
    const prisma = app.get(PrismaService);
    const user = await prisma.user.update({
      where: { email },
      data: { image: "https://images.example.com/chosen.png" },
    });
    const path = `/api/v1/users/${user.id}/avatar`;
    for (const token of [null, login.headers["set-auth-token"], other.headers["set-auth-token"]]) {
      const get = request(app.getHttpServer()).get(path);
      if (token) get.auth(token, { type: "bearer" });
      const image = await get.expect(200);
      expect(image.body).toEqual(png);
      expect(image.headers["content-type"]).toContain("image/png");
      expect(image.headers["cache-control"]).toBe("private, no-store");
      expect(image.headers.location).toBeUndefined();
      expect(JSON.stringify(image.headers)).not.toContain(email);
      expect(JSON.stringify(image.headers)).not.toContain("gravatar.com");
    }
    // A new verified email selects its own image/fallback, without a user-ID cache.
    const nextEmail = `avatar-missing-${crypto.randomUUID()}@example.com`;
    await prisma.user.update({ where: { id: user.id }, data: { email: nextEmail } });
    const missing = await request(app.getHttpServer()).get(path).expect(302);
    expect(missing.headers.location).toBe(`/api/v1/avatars/${user.id}.svg`);
    expect(resolveAvatar).toHaveBeenLastCalledWith(nextEmail);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).image).toBe(
      "https://images.example.com/chosen.png",
    );
  });

  it("withholds photos and provider lookups for unverified, inactive, suspended and deleted accounts", async () => {
    const email = `avatar-hit-${crypto.randomUUID()}@example.com`;
    const login = await signInWithCode(app.getHttpServer(), { email });
    const id = login.body.user.id;
    const path = `/api/v1/users/${id}/avatar`;
    const prisma = app.get(PrismaService);
    await request(app.getHttpServer()).get(path).expect(200);
    for (const data of [
      { accountState: "active", emailVerified: false, deletionScheduledFor: null },
      { accountState: "inactive", emailVerified: true, deletionScheduledFor: null },
      { accountState: "suspended", emailVerified: true, deletionScheduledFor: null },
      {
        accountState: "inactive",
        emailVerified: true,
        deletionScheduledFor: new Date(Date.now() + 86400000),
      },
    ]) {
      await prisma.user.update({ where: { id }, data });
      resolveAvatar.mockClear();
      const hidden = await request(app.getHttpServer()).get(path).expect(302);
      expect(hidden.headers.location).toBe(`/api/v1/avatars/${id}.svg`);
      expect(hidden.headers["cache-control"]).toBe("private, no-store");
      expect(resolveAvatar).not.toHaveBeenCalled();
    }
    await prisma.user.update({
      where: { id },
      data: { accountState: "active", deletionScheduledFor: null },
    });
    await request(app.getHttpServer()).get(path).expect(200);
    await prisma.user.delete({ where: { id } });
    resolveAvatar.mockClear();
    const deleted = await request(app.getHttpServer()).get(path).expect(302);
    expect(deleted.headers.location).toBe(`/api/v1/avatars/${id}.svg`);
    expect(resolveAvatar).not.toHaveBeenCalled();
  });

  it("discards in-flight photos after email changes or account deactivation", async () => {
    const prisma = app.get(PrismaService);
    for (const changeEmail of [true, false]) {
      const email = `avatar-hit-${crypto.randomUUID()}@example.com`;
      const login = await signInWithCode(app.getHttpServer(), { email });
      const id = login.body.user.id;
      let started = () => {},
        release = () => {};
      const waiting = new Promise<void>((done) => {
        started = done;
      });
      const held = new Promise<void>((done) => {
        release = done;
      });
      resolveAvatar.mockImplementationOnce(async () => {
        started();
        await held;
        return { body: png, contentType: "image/png" };
      });
      const result = request(app.getHttpServer())
        .get(`/api/v1/users/${id}/avatar`)
        .then((response) => response);
      try {
        await waiting;
        await prisma.user.update({
          where: { id },
          data: changeEmail
            ? { email: `avatar-missing-${crypto.randomUUID()}@example.com` }
            : { accountState: "inactive" },
        });
      } finally {
        release();
      }
      const response = await result;
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`/api/v1/avatars/${id}.svg`);
    }
  });
});
