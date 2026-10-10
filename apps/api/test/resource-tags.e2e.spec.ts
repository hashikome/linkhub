import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { itemTags } from "../src/modules/resources/item-tags";
import { signInWithCode } from "./fixtures/sign-in";

describe("collection resource tag summary", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication<INestApplication<App>>({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it("accepts bounded Unicode tags whose lowercase form expands at the truncation boundary", async () => {
    const login = await signInWithCode(app.getHttpServer(), {
      email: `unicode-tags-${crypto.randomUUID()}@example.com`,
      name: "Unicode tags",
    });
    const token = login.headers["set-auth-token"] as string;
    const created = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({ slug: "unicode-tags", title: "Unicode tags" })
      .expect(201);
    const input = `İ${"a".repeat(77)} b`;
    expect(input.length).toBe(80);
    const item = await request(app.getHttpServer())
      .post(`/api/v1/collections/${created.body.data.id}/resources/external`)
      .auth(token, { type: "bearer" })
      .send({ url: "https://fixture-links.dev/unicode-tags", position: 0, tags: [input] })
      .expect(201);
    expect(item.body.data.tags).toEqual([`i\u0307${"a".repeat(77)}`]);
    const collection = await request(app.getHttpServer())
      .get(`/api/v1/collections/${created.body.data.id}`)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(collection.body.data.tags).toEqual(item.body.data.tags);
  });

  it("ranks stored tags by item usage across all pages, breaks ties by name and isolates collections", async () => {
    const login = await signInWithCode(app.getHttpServer(), {
      email: `resource-tags-${crypto.randomUUID()}@example.com`,
      name: "Tag curator",
    });
    const token = login.headers["set-auth-token"] as string;
    const create = async (slug: string) => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/collections")
        .auth(token, { type: "bearer" })
        .send({ slug, title: slug })
        .expect(201);
      return response.body.data.id as string;
    };
    const id = await create("tag-summary"),
      other = await create("other-tags");
    await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({ slug: "authored-tags", title: "Authored", tags: ["forbidden"] })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${id}`)
      .auth(token, { type: "bearer" })
      .send({ version: 1, tags: ["forbidden"] })
      .expect(400);

    const fixtureItems = [
      ...Array.from({ length: 22 }, (_, index) => ({
        collectionId: id,
        kind: "external_link",
        url: `https://fixture-links.dev/tags-${index}`,
        position: index,
        tags: index === 21 ? ["late-page", "shared", "shared"] : ["shared"],
      })),
      {
        collectionId: other,
        kind: "external_link",
        url: "https://fixture-links.dev/private-tag",
        position: 0,
        tags: ["private-target", "shared"],
      },
      {
        collectionId: id,
        kind: "collection_link",
        linkedCollectionId: other,
        position: 22,
        tags: ["reference-tag", "alpha"],
      },
    ];
    for (const { tags, ...data } of fixtureItems)
      await prisma.resource.create({ data: { ...data, tags: await itemTags(prisma, tags) } });
    const read = () =>
      request(app.getHttpServer()).get(`/api/v1/collections/${id}`).auth(token, { type: "bearer" });
    const page = await request(app.getHttpServer())
      .get(`/api/v1/collections/${id}/resources?limit=20`)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(page.body.data).toHaveLength(20);
    expect(page.body.data.flatMap((resource: { tags: string[] }) => resource.tags)).not.toContain(
      "late-page",
    );
    // Includes later pages and reference-item labels, never target contents.
    const expected = ["shared", "alpha", "late-page", "reference-tag"];
    expect((await read().expect(200)).body.data.tags).toEqual(expected);
    await request(app.getHttpServer()).get(`/api/v1/collections/${id}`).expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${id}/publish`)
      .auth(token, { type: "bearer" })
      .expect(201);
    const publicView = await request(app.getHttpServer())
      .get(`/api/v1/collections/${id}`)
      .expect(200);
    expect(publicView.body.data.tags).toEqual(expected);
    const stored = await prisma.collection.findUniqueOrThrow({
      where: { id },
      include: {
        tags: {
          include: { tag: true },
          orderBy: [{ itemCount: "desc" }, { tag: { name: "asc" } }],
        },
      },
    });
    expect(stored.tags.map(({ tag }) => tag.name)).toEqual(expected);
    expect(stored.tags.find(({ tag }) => tag.name === "shared")?.itemCount).toBe(22);
    for (const path of ["/api/v1/discover", `/api/v1/hubs/${stored.hubId}/collections`]) {
      const list = await request(app.getHttpServer()).get(path).expect(200);
      expect(list.body.data.find((item: { id: string }) => item.id === id).tags).toEqual(expected);
    }

    const last = await prisma.resource.findUniqueOrThrow({
      where: { collectionId_position: { collectionId: id, position: 21 } },
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${id}/resources/${last.id}`)
      .auth(token, { type: "bearer" })
      .send({ version: Number(last.version), tags: ["edited"] })
      .expect(200);
    expect((await read().expect(200)).body.data.tags).toEqual([
      "shared",
      "alpha",
      "edited",
      "reference-tag",
    ]);
    await request(app.getHttpServer())
      .delete(`/api/v1/collections/${id}/resources/${last.id}`)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect((await read().expect(200)).body.data.tags).toEqual(["shared", "alpha", "reference-tag"]);
    const empty = await create("empty-tags");
    const emptyView = await request(app.getHttpServer())
      .get(`/api/v1/collections/${empty}`)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(emptyView.body.data.tags).toEqual([]);
  });

  it("keeps the stored relation correct through concurrency, rollback and cascades", async () => {
    const login = await signInWithCode(app.getHttpServer(), {
      email: `tag-sync-${crypto.randomUUID()}@example.com`,
      name: "Tag sync",
    });
    const created = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(login.headers["set-auth-token"], { type: "bearer" })
      .send({ slug: "sync", title: "Sync" })
      .expect(201);
    const id = created.body.data.id as string;
    const rows = await Promise.all(
      Array.from({ length: 8 }, async (_, position) =>
        prisma.$transaction(async (tx) =>
          tx.resource.create({
            data: {
              collectionId: id,
              kind: "external_link",
              position,
              url: `https://fixture-links.dev/sync-${position}`,
              tags: await itemTags(tx, ["shared", "shared"]),
            },
          }),
        ),
      ),
    );
    const read = () =>
      prisma.collectionTag.findMany({ where: { collectionId: id }, include: { tag: true } });
    expect((await read()).map((row) => [row.tag.name, row.itemCount])).toEqual([["shared", 8]]);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.resource.update({
          where: { id: rows[0].id },
          data: { tags: { deleteMany: {}, ...(await itemTags(tx, ["rolled-back"])) } },
        });
        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");
    expect((await read()).map((row) => [row.tag.name, row.itemCount])).toEqual([["shared", 8]]);
    await Promise.all(
      rows.slice(0, 7).map((row) => prisma.resource.delete({ where: { id: row.id } })),
    );
    expect((await read()).map((row) => [row.tag.name, row.itemCount])).toEqual([["shared", 1]]);
    await prisma.resource.update({ where: { id: rows[7].id }, data: { tags: { deleteMany: {} } } });
    expect(await read()).toEqual([]);
    await prisma.resource.update({
      where: { id: rows[7].id },
      data: { tags: await itemTags(prisma, ["restored"]) },
    });
    await prisma.collection.delete({ where: { id } });
    expect(await read()).toEqual([]);
  });
});
