import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { LinkMetadataLookup, RETRY_DELAYS_MS } from "../src/modules/resources/link-metadata-lookup";
import { signInWithCode } from "./fixtures/sign-in";

describe("link metadata", () => {
  let app: INestApplication, prisma: PrismaService, token: string, collectionId: string;
  const page = { title: "Practical Typography", description: "A guide.", siteName: "Butterick" };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const login = await signInWithCode(app.getHttpServer(), {
      email: `metadata-${randomUUID()}@example.com`,
    });
    token = login.headers["set-auth-token"] as string;
    const created = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({ published: false, slug: `meta-${randomUUID().slice(0, 8)}`, title: "Metadata" })
      .expect(201);
    collectionId = created.body.data.id;
  });
  beforeEach(async () => {
    await prisma.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  const save = (url: string, position: number) =>
    request(app.getHttpServer())
      .post(`/api/v1/collections/${collectionId}/resources/external`)
      .auth(token, { type: "bearer" })
      .send({ url, position })
      .expect(201);
  const list = async () =>
    (
      await request(app.getHttpServer())
        .get(`/api/v1/collections/${collectionId}/resources`)
        .auth(token, { type: "bearer" })
        .expect(200)
    ).body.data as Array<Record<string, unknown>>;

  it("requests a lookup with the save, shares it per address, and reads it without touching the item", async () => {
    const url = `https://fixture-links.dev/meta-${randomUUID()}`;
    const saved = await save(url, 0);
    expect(saved.body.data).toMatchObject({ title: null, description: null, siteName: null });
    const row = await prisma.linkMetadata.findUniqueOrThrow({ where: { url } });
    expect(row.state).toBe("pending");

    // The worker resolves it; the item itself is unchanged (no version bump).
    await new LinkMetadataLookup(prisma, async () => page).lookup(row.id);
    const [item] = (await list()).filter((r) => r.url === url);
    expect(item).toMatchObject({ ...page, version: 1 });

    // A second collection with the same address reuses the row.
    const other = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({ published: false, slug: `meta-b-${randomUUID().slice(0, 8)}`, title: "Second" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${other.body.data.id}/resources/external`)
      .auth(token, { type: "bearer" })
      .send({ url, position: 0 })
      .expect(201)
      .expect((res) => expect(res.body.data.title).toBe(page.title));
    expect(await prisma.linkMetadata.count({ where: { url } })).toBe(1);
  });

  it("sections keep their text as title and links never accept one", async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/v1/collections/${collectionId}/resources/external`)
      .auth(token, { type: "bearer" })
      .send({ url: "https://fixture-links.dev/section", position: 50 })
      .expect(201);
    const heading = await request(app.getHttpServer())
      .post(`/api/v1/collections/${collectionId}/resources/heading`)
      .auth(token, { type: "bearer" })
      .send({
        title: "Getting started",
        firstItemId: first.body.data.id,
        firstItemVersion: first.body.data.version,
      })
      .expect(201);
    expect(heading.body.data).toMatchObject({ title: "Getting started", description: null });
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${collectionId}/resources/external`)
      .auth(token, { type: "bearer" })
      .send({ url: "https://fixture-links.dev/typed-title", position: 51, title: "Typed" })
      .expect(400);
  });

  it("retries failed lookups with backoff, then gives up; never claims a leased row", async () => {
    const url = `https://fixture-links.dev/meta-fail-${randomUUID()}`;
    await save(url, 2);
    const { id } = await prisma.linkMetadata.findUniqueOrThrow({ where: { url } });
    const failing = new LinkMetadataLookup(prisma, async () => null);

    for (const delay of RETRY_DELAYS_MS) {
      const before = Date.now();
      await failing.lookup(id);
      const row = await prisma.linkMetadata.findUniqueOrThrow({ where: { id } });
      expect(row.state).toBe("pending");
      expect(row.availableAt.getTime()).toBeGreaterThanOrEqual(before + delay - 1000);
      // Not yet due: another attempt claims nothing.
      await failing.lookup(id);
      expect((await prisma.linkMetadata.findUniqueOrThrow({ where: { id } })).attempts).toBe(
        row.attempts,
      );
      await prisma.linkMetadata.update({ where: { id }, data: { availableAt: new Date(0) } });
    }
    await failing.lookup(id);
    expect((await prisma.linkMetadata.findUniqueOrThrow({ where: { id } })).state).toBe("failed");

    // Saving the address again (here, into another collection) tries it again.
    const again = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({ published: false, slug: `meta-retry-${randomUUID().slice(0, 8)}`, title: "Retry" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${again.body.data.id}/resources/external`)
      .auth(token, { type: "bearer" })
      .send({ url, position: 0 })
      .expect(201);
    expect(await prisma.linkMetadata.findUniqueOrThrow({ where: { id } })).toMatchObject({
      state: "pending",
      attempts: 0,
    });

    // A failure is due again a day later; reading its collection retries it.
    await prisma.linkMetadata.update({
      where: { id },
      data: { state: "failed", availableAt: new Date(Date.now() + 3600_000) },
    });
    await list();
    expect((await prisma.linkMetadata.findUniqueOrThrow({ where: { id } })).state).toBe("failed");
    await prisma.linkMetadata.update({ where: { id }, data: { availableAt: new Date(0) } });
    await list();
    expect((await prisma.linkMetadata.findUniqueOrThrow({ where: { id } })).state).toBe("pending");

    // A row someone else holds the lease on is left alone.
    const leasedUrl = `https://fixture-links.dev/meta-leased-${randomUUID()}`;
    await save(leasedUrl, 3);
    const leased = await prisma.linkMetadata.update({
      where: { url: leasedUrl },
      data: { leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 60_000) },
    });
    await new LinkMetadataLookup(prisma, async () => page).lookup(leased.id);
    expect((await prisma.linkMetadata.findUniqueOrThrow({ where: { id: leased.id } })).state).toBe(
      "pending",
    );
  });

  it("re-requests missing and stale metadata when a collection is read", async () => {
    const url = `https://fixture-links.dev/meta-stale-${randomUUID()}`;
    await save(url, 4);
    await prisma.linkMetadata.update({
      where: { url },
      data: { ...page, state: "ready", fetchedAt: new Date(Date.now() - 40 * 86400_000) },
    });
    const [item] = (await list()).filter((r) => r.url === url);
    expect(item.title).toBe(page.title); // still shown while it refreshes
    expect((await prisma.linkMetadata.findUniqueOrThrow({ where: { url } })).state).toBe("pending");

    await prisma.linkMetadata.delete({ where: { url } });
    await list();
    expect((await prisma.linkMetadata.findUniqueOrThrow({ where: { url } })).state).toBe("pending");
  });
});
