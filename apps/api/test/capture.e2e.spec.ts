import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { publicOrigins } from "@nslinkhub/config/public-origins";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("atomic link capture", () => {
  let app: INestApplication, prisma: PrismaService;
  let owner: { id: string; token: string }, other: { id: string; token: string };
  const send = (body: object, token = owner.token) =>
    request(app.getHttpServer()).post("/api/v1/capture").auth(token, { type: "bearer" }).send(body);
  const input = (destination = "first") => ({
    operationId: randomUUID(),
    links: [{ url: `https://fixture-links.dev/${randomUUID()}` }],
    destination,
    startedAt: Date.now(),
  });
  const link = (url: string) => ({ links: [{ url }] });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const login = async () => {
      const r = await signInWithCode(app.getHttpServer(), {
        email: `capture-${randomUUID()}@example.com`,
      });
      return { id: r.body.user.id, token: r.headers["set-auth-token"] as string };
    };
    owner = await login();
    other = await login();
  });
  beforeEach(async () => {
    await prisma.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });
  it("concurrent first saves create one published collection and replay creates no duplicates", async () => {
    const a = input(),
      b = input();
    const [one, two] = await Promise.all([send(a).expect(201), send(b).expect(201)]);
    expect(one.body.data.collectionId).toBe(two.body.data.collectionId);
    const hub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: owner.id } });
    expect(await prisma.collection.count({ where: { hubId: hub.id } })).toBe(1);
    const collection = await prisma.collection.findUniqueOrThrow({
      where: { id: one.body.data.collectionId },
    });
    expect(collection.published).toBe(true);
    expect(collection.linkSharingEnabled).toBe(false);
    const replay = await send(a).expect(201);
    expect(replay.body.data).toEqual(one.body.data);
    await send({ ...a, ...link("https://different.fixture-links.dev") }).expect(409);
    expect(await prisma.resource.count({ where: { collectionId: collection.id } })).toBe(2);
    await request(app.getHttpServer()).get(`/api/v1/collections/${collection.id}`).expect(200);
    await send({ ...input(collection.id) }, other.token).expect(403);
  });
  it("requires a choice for returning owners and deduplicates canonical URLs in an explicit destination", async () => {
    await send(input()).expect(409);
    const a = input("new"),
      created = await send(a).expect(201);
    const id = created.body.data.collectionId;
    const again = await send({
      ...input(id),
      ...link(`${a.links[0].url}?utm_source=test`),
    }).expect(201);
    expect(again.body.data.resourceIds).toEqual(created.body.data.resourceIds);
    await prisma.collection.update({ where: { id }, data: { published: true } });
    await send({
      ...input(id),
      ...link("https://fixture-links.dev/explicit-published-choice"),
    }).expect(201);
  });
  it("rolls back new collection and resource when receipt persistence fails, then permits retry", async () => {
    const hub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: owner.id } });
    const before = await prisma.collection.count({ where: { hubId: hub.id } }),
      body = input("new");
    await prisma.$executeRawUnsafe(
      `ALTER TABLE capture_receipts ADD CONSTRAINT capture_test_failure CHECK (operation_id <> '${body.operationId}'::uuid)`,
    );
    try {
      await send(body).expect(500);
    } finally {
      await prisma.$executeRawUnsafe(
        "ALTER TABLE capture_receipts DROP CONSTRAINT capture_test_failure",
      );
    }
    expect(await prisma.collection.count({ where: { hubId: hub.id } })).toBe(before);
    await send(body).expect(201);
    expect(await prisma.collection.count({ where: { hubId: hub.id } })).toBe(before + 1);
  });
  it("saves several links in order with tags, ignores typed titles, and names new collections", async () => {
    const urls = [0, 1].map(() => `https://fixture-links.dev/${randomUUID()}`);
    const body = {
      ...input("new"),
      links: [
        { url: urls[0], tags: ["Guide", "guide"] },
        { url: urls[1], tags: ["video"] },
      ],
    };
    const saved = await send(body).expect(201);
    const { collectionId, resourceIds } = saved.body.data;
    expect(resourceIds).toHaveLength(2);
    const rows = await prisma.resource.findMany({
      where: { collectionId },
      include: { tags: { include: { tag: true }, orderBy: { position: "asc" } } },
      orderBy: { position: "asc" },
    });
    expect(
      rows.map((row) => [row.url, row.titleOverride, row.tags.map(({ tag }) => tag.name)]),
    ).toEqual([
      [urls[0], null, ["guide"]],
      [urls[1], null, ["video"]],
    ]);
    // Each address has a pending metadata lookup, requested in the same save.
    expect(
      (await prisma.linkMetadata.findMany({ where: { url: { in: urls } } })).map((m) => m.state),
    ).toEqual(["pending", "pending"]);
    // The same address twice in one save is saved once.
    const twice = await send({
      ...input(collectionId),
      links: [{ url: urls[0] }, { url: `${urls[0]}?utm_source=dup` }],
    }).expect(201);
    expect(twice.body.data.resourceIds).toEqual([resourceIds[0]]);
    expect(rows.map((row) => row.id)).toEqual(resourceIds);
    expect((await send(body).expect(201)).body.data).toEqual(saved.body.data);
    // A title is never an input; it is resolved from the page.
    await send({ ...input("new"), links: [{ url: urls[0], title: "Typed" }] }).expect(400);

    // A default name never repeats one already in the hub; a typed name is kept.
    const first = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId } });
    expect(first.title).toMatch(/^Saved links, [A-Z][a-z]{2} \d{1,2}(?: \(\d+\))?$/);
    const second = await send(input("new")).expect(201);
    const next = await prisma.collection.findUniqueOrThrow({
      where: { id: second.body.data.collectionId },
    });
    expect(next.title).not.toBe(first.title);
    const named = await send({ ...input("new"), collectionTitle: " Reading list " }).expect(201);
    expect(
      (await prisma.collection.findUniqueOrThrow({ where: { id: named.body.data.collectionId } }))
        .title,
    ).toBe("Reading list");
    await send({ ...input("new"), links: [] }).expect(400);
    await send({
      ...input("new"),
      links: Array.from({ length: 3 }, () => ({
        url: `https://fixture-links.dev/${randomUUID()}`,
      })),
    }).expect(400);
  });
  it("validates usable public links before sign-in and still requires a session to save", async () => {
    const preview = (url: string) =>
      request(app.getHttpServer()).get(`/api/v1/link-preview?${new URLSearchParams({ url })}`);
    await preview("https://fixture-links.dev/a").expect(200);
    await request(app.getHttpServer()).post("/api/v1/capture").send(input()).expect(401);
    for (const url of ["javascript:alert(1)", "https://user:pass@example.com", "not a url"])
      await preview(url).expect(400);
    const ok = await preview("https://fixture-links.dev/a?utm_source=x")
      .auth(owner.token, { type: "bearer" })
      .expect(200);
    // Lookups are disabled under test; the address still comes back canonical.
    expect(ok.body.data).toEqual({
      url: "https://fixture-links.dev/a",
      title: null,
      status: "untitled",
    });
    // Addresses others can't open are refused before any lookup.
    for (const url of [
      "http://localhost:8085/notebook/",
      "https://example.com/",
      "http://10.0.0.8/",
    ]) {
      const refused = await preview(url).expect(400);
      expect(refused.body.error.code).toBe("link_not_public");
    }
  });
  it("returns a stored title anonymously without creating an account and bounds public lookups", async () => {
    const url = `https://fixture-links.dev/preview-${randomUUID()}`;
    await prisma.linkMetadata.create({ data: { url, title: "A useful notebook", state: "ready" } });
    const users = await prisma.user.count();
    const hubs = await prisma.hub.count();
    const titles = process.env.LINK_TITLES;
    process.env.LINK_TITLES = "on";
    try {
      for (let n = 0; n < 30; n++) {
        const path = n % 2 ? "/api/v1/link-preview" : "/API/v1/link-preview/";
        const response = await request(app.getHttpServer()).get(path).query({ url }).expect(200);
        expect(response.body.data).toEqual({ url, title: "A useful notebook", status: "found" });
      }
      const limited = await request(app.getHttpServer())
        .get("/api/v1/link-preview/")
        .query({ url })
        .expect(429);
      expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
      expect(await prisma.user.count()).toBe(users);
      expect(await prisma.hub.count()).toBe(hubs);
    } finally {
      if (titles === undefined) delete process.env.LINK_TITLES;
      else process.env.LINK_TITLES = titles;
    }
  });
  it("refuses links that only work locally or are examples", async () => {
    for (const url of [
      "http://localhost:8085/a",
      "http://127.0.0.1/a",
      "https://www.example.org/a",
      "https://printer.local/",
    ]) {
      const refused = await send({ ...input("new"), ...link(url) }).expect(400);
      expect(refused.body.error.code).toBe("link_not_public");
    }
  });
  it("replays saved reference IDs after slug and handle changes, but rejects deleted receipts", async () => {
    const target = (await send(input("new")).expect(201)).body.data;
    const collection = await prisma.collection.findUniqueOrThrow({
      where: { id: target.collectionId },
      include: { hub: true },
    });
    const body = {
      ...input("new"),
      links: [
        {
          url: `${publicOrigins(process.env).webOrigin}/@${collection.hub.handle}/${collection.slug}`,
        },
        { url: `${publicOrigins(process.env).webOrigin}/c/${collection.id}` },
      ],
    };
    const saved = (await send(body).expect(201)).body.data;
    expect(saved.resourceIds).toHaveLength(1);
    await prisma.collection.update({
      where: { id: collection.id },
      data: { slug: `renamed-${randomUUID()}` },
    });
    expect((await send(body).expect(201)).body.data).toEqual(saved);
    await prisma.hub.update({
      where: { id: collection.hubId },
      data: { handle: `renamed-${randomUUID()}` },
    });
    expect((await send(body).expect(201)).body.data).toEqual(saved);
    await prisma.resource.delete({ where: { id: saved.resourceIds[0] } });
    await send(body).expect(404);
  });
  it("upgrades a legacy receipt on a resolvable retry", async () => {
    const body = input("new"),
      saved = (await send(body).expect(201)).body.data;
    await prisma.captureReceipt.update({
      where: { userId_operationId: { userId: owner.id, operationId: body.operationId } },
      data: { resourceIds: [] },
    });
    expect((await send(body).expect(201)).body.data).toEqual(saved);
    expect(
      (
        await prisma.captureReceipt.findUniqueOrThrow({
          where: { userId_operationId: { userId: owner.id, operationId: body.operationId } },
        })
      ).resourceIds,
    ).toEqual(saved.resourceIds);
  });
  it("rejects malicious URLs, missing sessions and replay after deletion", async () => {
    for (const url of [
      "javascript:alert(1)",
      "ftp://fixture-links.dev",
      "https://user:pass@example.com",
    ])
      await send({ ...input("new"), ...link(url) }).expect(400);
    await request(app.getHttpServer()).post("/api/v1/capture").send(input()).expect(401);
    const body = input("new"),
      result = await send(body).expect(201);
    await prisma.collection.delete({ where: { id: result.body.data.collectionId } });
    await send(body).expect(404);
  });
});

it("accepts an unpublished creation choice while ordinary creation defaults to published", async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  try {
    const signed = await signInWithCode(app.getHttpServer(), {
      email: `publication-${randomUUID()}@example.com`,
    });
    const token = signed.headers["set-auth-token"] as string;
    const api = () => request(app.getHttpServer());
    const first = (
      await api()
        .post("/api/v1/capture")
        .auth(token, { type: "bearer" })
        .send({
          operationId: randomUUID(),
          startedAt: Date.now(),
          destination: "first",
          published: false,
          links: [{ url: `https://fixture-links.dev/${randomUUID()}` }],
        })
        .expect(201)
    ).body.data;
    await api().get(`/api/v1/collections/${first.collectionId}`).expect(404);
    const created = (
      await api()
        .post("/api/v1/collections")
        .auth(token, { type: "bearer" })
        .send({ title: "Default public", slug: `default-${randomUUID()}` })
        .expect(201)
    ).body.data;
    expect(created.published).toBe(true);
    await api().get(`/api/v1/collections/${created.id}`).expect(200);
  } finally {
    await app.close();
  }
});
