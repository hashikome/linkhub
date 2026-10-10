import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { signInWithCode } from "./fixtures/sign-in";

// Account identity exists independently of an optional publishing hub.
describe("Identity & profile (e2e)", () => {
  let app: INestApplication<App>;
  const sfx = Date.now().toString(36);

  const signUp = async (name: string, email: string) => {
    const res = await signInWithCode(app.getHttpServer(), { email, name });
    return res.headers["set-auth-token"];
  };

  const profile = async (bearer: string) =>
    (
      await request(app.getHttpServer())
        .get("/api/v1/profile")
        .set("Authorization", `Bearer ${bearer}`)
        .expect(200)
    ).body as {
      data: {
        id: string;
        displayName: string;
        username: string;
        handle: string | null;
        hubId: string | null;
      };
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

  it("gives each user a derived username and no hub", async () => {
    const name = `Ada ${sfx}`;
    const bearer = await signUp(name, `ada_${sfx}@example.com`);
    const { data } = await profile(bearer);

    expect(data.displayName).toBe(name);
    expect(data.hubId).toBeNull();
    expect(data.username).toMatch(/^ada-/);
    expect(data.handle).toBeNull();
  });

  it("derives distinct usernames when two users share a name", async () => {
    const name = `Grace ${sfx}`;
    const a = await profile(await signUp(name, `grace1_${sfx}@example.com`));
    const b = await profile(await signUp(name, `grace2_${sfx}@example.com`));
    expect(a.data.username).not.toBe(b.data.username);
  });

  it("renames the username without creating a hub and rejects reserved usernames", async () => {
    const bearer = await signUp(`Linus ${sfx}`, `linus_${sfx}@example.com`);
    const newHandle = `renamed-${sfx}`;

    await request(app.getHttpServer())
      .patch("/api/v1/profile")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ username: newHandle })
      .expect(200);

    const { data } = await profile(bearer);
    expect(data.username).toBe(newHandle);
    expect(data.hubId).toBeNull();

    await request(app.getHttpServer())
      .patch("/api/v1/profile")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ username: "api" })
      .expect(400);
  });

  it("allows profile details but rejects identity and credential writes atomically", async () => {
    const email = `credentials-${sfx}@example.com`;
    const bearer = await signUp("Credential owner", email);
    const before = await profile(bearer);
    for (const fields of [
      { id: crypto.randomUUID() },
      { userId: crypto.randomUUID() },
      { email: `replacement-${sfx}@example.com` },
      { password: "ChangedPassword123!" },
      { email: `replacement-${sfx}@example.com`, password: "ChangedPassword123!" },
    ]) {
      const response = await request(app.getHttpServer())
        .patch("/api/v1/profile")
        .set("Authorization", `Bearer ${bearer}`)
        .send({ ...fields, displayName: "Must not change" })
        .expect(400);
      expect(response.body.error.code).toBe("validation_failed");
    }
    await request(app.getHttpServer())
      .put("/api/v1/profile")
      .set("Authorization", `Bearer ${bearer}`)
      .send({
        id: crypto.randomUUID(),
        email: `replacement-${sfx}@example.com`,
        displayName: "Must not change",
      })
      .expect(404);
    expect(await profile(bearer)).toEqual(before);
    const edited = await request(app.getHttpServer())
      .patch("/api/v1/profile")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ displayName: "Updated name", bio: "Updated bio" })
      .expect(200);
    expect(edited.body.data.displayName).toBe("Updated name");
    expect(edited.body.data.bio).toBe("Updated bio");
    expect(edited.body.data.id).toBe(before.data.id);
    expect(edited.body.data.email).toBe(email);
    const again = await signInWithCode(app.getHttpServer(), { email });
    expect((await profile(again.headers["set-auth-token"])).data).toEqual(
      (await profile(bearer)).data,
    );
  });

  it("keeps account deletion unavailable and preserves the account and its hub", async () => {
    const bearer = await signUp("Retained owner", `retained-${sfx}@example.com`);
    const before = await profile(bearer);
    await request(app.getHttpServer())
      .delete("/api/v1/profile")
      .set("Authorization", `Bearer ${bearer}`)
      .expect(404);
    await request(app.getHttpServer())
      .post("/api/v1/auth/delete-user")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ password: "Password123!" })
      .expect(404);
    expect(await profile(bearer)).toEqual(before);
  });

  it("keeps password signup, login, enrollment, change and reset unavailable", async () => {
    const email = `no-password-${sfx}@example.com`;
    const bearer = await signUp("Code owner", email);
    for (const path of [
      "sign-up/email",
      "sign-in/email",
      "set-password",
      "change-password",
      "request-password-reset",
      "reset-password",
      "forget-password",
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/auth/${path}`)
        .set("Authorization", `Bearer ${bearer}`)
        .send({
          email,
          password: "UnusedPassword123!",
          newPassword: "UnusedPassword123!",
          currentPassword: "UnusedPassword123!",
        })
        .expect(404);
    }
    await profile(bearer);
  });
});
