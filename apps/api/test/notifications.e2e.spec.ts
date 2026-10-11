import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NotificationView } from "@linkhub/types";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("notification center", () => {
  let app: INestApplication, prisma: PrismaService;
  let user: { id: string; email: string; token: string };
  const as = (method: "get" | "post", path: string, token = user.token) =>
    request(app.getHttpServer())[method](path).auth(token, { type: "bearer" });
  const unread = async () =>
    (await as("get", "/api/v1/session").expect(200)).body.data.unreadNotifications as number;
  const list = async () =>
    (await as("get", "/api/v1/notifications").expect(200)).body.data as NotificationView[];
  // Only one pending invitation may exist per email; later ones use terminal states.
  const invite = (email = user.email, state = "pending") =>
    prisma.serviceInvitation.create({
      data: {
        role: "operator",
        state,
        email,
        inviteeUserId: email === user.email ? user.id : null,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const email = `notify-${randomUUID()}@example.com`;
    const signed = await signInWithCode(app.getHttpServer(), { email });
    user = { id: signed.body.user.id, email, token: signed.headers["set-auth-token"] as string };
  });
  afterAll(async () => {
    await app.close();
  });

  it("counts new items until seen, keeps them listed until cleared, then shows only newer ones", async () => {
    expect(await unread()).toBe(0);
    await invite(`someone-else-${randomUUID()}@example.com`);
    const first = await invite();
    expect(await unread()).toBe(1);
    expect((await list()).map((item) => [item.id, item.unread])).toEqual([[first.id, true]]);

    await as("post", "/api/v1/notifications/seen").expect(200);
    expect(await unread()).toBe(0);
    expect((await list()).map((item) => item.unread)).toEqual([false]);

    await Bun.sleep(10);
    const second = await invite(user.email, "declined");
    expect(await unread()).toBe(1);
    expect((await list()).map((item) => item.id)).toEqual([second.id, first.id]);

    await as("post", "/api/v1/notifications/clear").expect(200);
    expect(await unread()).toBe(0);
    expect(await list()).toEqual([]);

    await Bun.sleep(10);
    const third = await invite(user.email, "cancelled");
    expect(await unread()).toBe(1);
    expect((await list()).map((item) => item.id)).toEqual([third.id]);
  });

  it("requires a session", async () => {
    await request(app.getHttpServer()).get("/api/v1/notifications").expect(401);
    await request(app.getHttpServer()).post("/api/v1/notifications/seen").expect(401);
  });
});
