import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { INestApplication } from "@nestjs/common";
import { INTERCEPTORS_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { importJobService } from "../src/modules/imports/import-jobs";
import { expireImportDrafts } from "../src/modules/imports/import-maintenance";
import { IMPORT_ROWS } from "../src/modules/imports/import-parser";
import { ImportsController } from "../src/modules/imports/imports.controller";
import { IMPORT_LOOKUPS_PER_DAY, ImportsService } from "../src/modules/imports/imports.service";
import { LinkMetadataLookup } from "../src/modules/resources/link-metadata-lookup";
import { ResourcesService } from "../src/modules/resources/resources.service";
import { signInWithCode } from "./fixtures/sign-in";

let app: INestApplication, db: PrismaService, token: string, userId: string, collectionId: string;
const url = () => `https://fixture-links.dev/import-${randomUUID()}`;
const api = () => request(app.getHttpServer());
function bookmarkFile(groups: Array<[string, string[]]>) {
  return `<DL>${groups.map(([name, urls]) => `<DT><H3>${name}</H3><DL>${urls.map((url) => `<DT><A HREF="${url}">Link</A>`).join("")}</DL>`).join("")}</DL>`;
}
async function person(hub = true) {
  const result = await signInWithCode(app.getHttpServer(), {
    email: `import-${randomUUID()}@example.com`,
    name: "Importer",
  });
  const token = result.headers["set-auth-token"] as string;
  if (hub) await api().post("/api/v1/hubs").auth(token, { type: "bearer" }).send({}).expect(201);
  return { token, id: result.body.user.id as string };
}
async function draft(addresses: string[], actor = token) {
  const created = (
    await api()
      .post("/api/v1/imports")
      .auth(actor, { type: "bearer" })
      .field("sourceKind", "text")
      .attach("file", Buffer.from(addresses.join("\n")), "links.txt")
      .expect(201)
  ).body.data;
  return (
    await api()
      .patch(`/api/v1/imports/${created.id}/destination`)
      .auth(actor, { type: "bearer" })
      .send({ version: created.version, collectionTitle: "My links" })
      .expect(200)
  ).body.data;
}
async function read(id: string) {
  return (await api().get(`/api/v1/imports/${id}`).auth(token, { type: "bearer" }).expect(200)).body
    .data;
}
async function rows(id: string) {
  return (await api().get(`/api/v1/imports/${id}/rows`).auth(token, { type: "bearer" }).expect(200))
    .body.data;
}
async function resolve(addresses: string[], success = true) {
  const lookup = new LinkMetadataLookup(db, async () =>
    success ? { title: "Resolved page", description: null, siteName: null } : null,
  );
  for (const page of await db.linkMetadata.findMany({ where: { url: { in: addresses } } }))
    await lookup.lookup(page.id);
}
function commit(d: { id: string; version: number }) {
  return api()
    .post(`/api/v1/imports/${d.id}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version });
}
beforeAll(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  db = app.get(PrismaService);
});
afterAll(async () => {
  await app?.close();
});
beforeEach(async () => {
  await db.requestBudget.deleteMany();
  const owner = await person();
  token = owner.token;
  userId = owner.id;
  collectionId = (
    await api()
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({ published: false, title: "Destination", slug: `import-${randomUUID()}` })
      .expect(201)
  ).body.data.id;
});
describe("reviewed imports", () => {
  it("stages only, resolves metadata through the worker, commits ready rows and preserves failures", async () => {
    const address = url(),
      failed = url();
    const d = await draft([address, "bad", failed, address]);
    expect(d.counts).toMatchObject({ looking_up: 2, failed: 1, duplicate: 1 });
    expect(await db.resource.count({ where: { url: address } })).toBe(0);
    await resolve([address]);
    await resolve([failed], false);
    const result = await commit(await read(d.id)).expect(201);
    expect(result.body.data.importedCount).toBe(1);
    expect(result.body.data.draft.counts).toMatchObject({ imported: 1, failed: 2, skipped: 1 });
    const saved = await db.resource.findFirstOrThrow({ where: { url: address } });
    expect(saved.titleOverride).toBeNull();
    expect(saved.addedByUserId).toBe(userId);
    expect(
      (await db.collection.findUniqueOrThrow({ where: { id: saved.collectionId } })).published,
    ).toBe(true);
    const invalid = (await rows(d.id)).find((r: { address: string }) => r.address === "bad");
    const fixed = url();
    const changed = await api()
      .patch(`/api/v1/imports/${d.id}/rows/${invalid.id}`)
      .auth(token, { type: "bearer" })
      .send({ version: result.body.data.draft.version, address: fixed, tags: ["CSS", "css"] })
      .expect(200);
    await resolve([fixed]);
    expect((await commit(changed.body.data).expect(201)).body.data.importedCount).toBe(1);
    expect(await db.resource.count({ where: { collectionId: saved.collectionId } })).toBe(2);
    const latest = await read(d.id);
    const dropped = await api()
      .post(`/api/v1/imports/${d.id}/drop-failed`)
      .auth(token, { type: "bearer" })
      .send({ version: latest.version })
      .expect(201);
    expect(dropped.body.data.closed).toBe(true);
    expect((await commit(latest).expect(201)).body.data.importedCount).toBe(0);
    expect(
      (await api().get("/api/v1/imports").auth(token, { type: "bearer" }).expect(200)).body.data[0]
        .closed,
    ).toBe(true);
  });
  it("requires an uploaded file and rejects database-incompatible text before creating a draft", async () => {
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .send({ sourceKind: "paste", urls: url() })
      .expect(400);
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .send({ sourceKind: "text" })
      .expect(400);
    for (const [kind, content] of [
      ["text", `${url()}\nhttps://fixture-links.dev/\0`],
      ["csv", `collection,section,url,tags\nWeb,HTML,${url()},tag\0`],
      ["csv", `collection,section,url,tags\nWeb,HTML\0,${url()},tag`],
    ])
      await api()
        .post("/api/v1/imports")
        .auth(token, { type: "bearer" })
        .field("sourceKind", kind)
        .attach("file", Buffer.from(content), `links.${kind}`)
        .expect(400);
    expect(await db.importDraft.count({ where: { userId } })).toBe(0);
    const d = await draft([url(), "bad-address"]);
    expect(d.sourceKind).toBe("text");
    expect(d.counts).toMatchObject({ looking_up: 1, failed: 1 });
  });
  it("imports reachable links without metadata using their address as the title", async () => {
    const addresses = [`${url()}.pdf`, `${url()}.png`];
    const d = await draft(addresses);
    const lookup = new LinkMetadataLookup(db, async () => ({
      title: null,
      description: null,
      siteName: null,
    }));
    for (const page of await db.linkMetadata.findMany({ where: { url: { in: addresses } } }))
      await lookup.lookup(page.id);
    expect((await read(d.id)).counts).toMatchObject({ ready: 2, failed: 0, looking_up: 0 });
    expect((await rows(d.id)).map((r: { title: string | null }) => r.title)).toEqual([null, null]);
    const result = (await commit(d).expect(201)).body.data;
    expect(result.importedCount).toBe(2);
    const saved = await api()
      .get(`/api/v1/collections/${result.destinations[0].collectionId}/resources`)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(
      saved.body.data.map((r: { title: string | null; url: string }) => ({
        title: r.title,
        url: r.url,
      })),
    ).toEqual(addresses.map((url) => ({ title: null, url })));
  });
  it("preserves nested bookmark sections, skips empty folders and adds repaired rows to their section", async () => {
    const a = url(),
      b = url(),
      c = url();
    const html = `<DL><DT><H3>Design</H3><DL><DT><A HREF="${a}">Ignored source title</A><DT><A HREF="bad">Bad</A><DT><H3>Typography</H3><DL><DT><A HREF="${b}">B</A></DL></DL><DT><H3>Failed only</H3><DL><DT><A HREF="bad2">Bad</A></DL></DL>`;
    const d = (
      await api()
        .post("/api/v1/imports")
        .auth(token, { type: "bearer" })
        .field("sourceKind", "bookmarks")
        .attach("file", Buffer.from(html), "bookmarks.html")
        .expect(201)
    ).body.data;
    await resolve([a, b]);
    const result = (await commit(d).expect(201)).body.data;
    const target = result.destinations[0].collectionId;
    let items = await db.resource.findMany({
      where: { collectionId: target },
      orderBy: { position: "asc" },
    });
    expect(items.map((r) => r.titleOverride ?? r.url)).toEqual([a, "Typography", b]);
    const failed = (await rows(d.id)).find((r: { address: string }) => r.address === "bad");
    const edited = (
      await api()
        .patch(`/api/v1/imports/${d.id}/rows/${failed.id}`)
        .auth(token, { type: "bearer" })
        .send({ version: result.draft.version, address: c })
        .expect(200)
    ).body.data;
    await resolve([c]);
    await commit(edited).expect(201);
    items = await db.resource.findMany({
      where: { collectionId: target },
      orderBy: { position: "asc" },
    });
    expect(items.map((r) => r.titleOverride ?? r.url)).toEqual([a, c, "Typography", b]);
  });
  it("preserves source order when an earlier folder or row is repaired after a partial commit", async () => {
    const a = url(),
      b = url(),
      c = url(),
      d = url();
    const html = `<DL><DT><H3>Library</H3>${bookmarkFile([
      ["First", ["bad-first"]],
      ["Second", ["bad-second", c]],
      ["Third", [d]],
    ])}</DL>`;
    let draft = (
      await api()
        .post("/api/v1/imports")
        .auth(token, { type: "bearer" })
        .field("sourceKind", "bookmarks")
        .attach("file", Buffer.from(html), "bookmarks.html")
        .expect(201)
    ).body.data;
    await resolve([c, d]);
    const first = (await commit(draft).expect(201)).body.data;
    draft = first.draft;
    const target = first.destinations[0].collectionId;
    for (const [address, fixed] of [
      ["bad-first", a],
      ["bad-second", b],
    ]) {
      const row = (await rows(draft.id)).find((r: { address: string }) => r.address === address);
      draft = (
        await api()
          .patch(`/api/v1/imports/${draft.id}/rows/${row.id}`)
          .auth(token, { type: "bearer" })
          .send({ version: draft.version, address: fixed })
          .expect(200)
      ).body.data;
    }
    await resolve([a, b]);
    await commit(draft).expect(201);
    const items = await db.resource.findMany({
      where: { collectionId: target },
      orderBy: { position: "asc" },
    });
    expect(items.map((r) => r.titleOverride ?? r.url)).toEqual([
      "First",
      a,
      "Second",
      b,
      c,
      "Third",
      d,
    ]);
  });
  it("creates CSV collections and sections without destination selection", async () => {
    const a = url(),
      b = url(),
      c = url();
    const existing = await db.collection.findUniqueOrThrow({ where: { id: collectionId } });
    let d = (
      await api()
        .post("/api/v1/imports")
        .auth(token, { type: "bearer" })
        .field("sourceKind", "csv")
        .attach(
          "file",
          Buffer.from(
            `collection,section,url,tags\n${existing.title},First,${a},CSS;tools\n${existing.title},First,bad,reference\nOther,,${c},\n`,
          ),
          "import.csv",
        )
        .expect(201)
    ).body.data;
    await api()
      .patch(`/api/v1/imports/${d.id}`)
      .auth(token, { type: "bearer" })
      .send({ version: d.version, structure: "single" })
      .expect(404);
    await api()
      .patch(`/api/v1/imports/${d.id}/folders/${d.folders[1].id}`)
      .auth(token, { type: "bearer" })
      .send({ version: d.version, mode: "collection" })
      .expect(404);
    await resolve([a, c]);
    const first = (await commit(d).expect(201)).body.data;
    expect(first.importedCount).toBe(2);
    expect(first.destinations).toHaveLength(2);
    expect(
      first.destinations.every(
        (dest: { collectionId: string }) => dest.collectionId !== collectionId,
      ),
    ).toBe(true);
    d = first.draft;
    const row = (await rows(d.id)).find((r: { address: string }) => r.address === "bad");
    d = (
      await api()
        .patch(`/api/v1/imports/${d.id}/rows/${row.id}`)
        .auth(token, { type: "bearer" })
        .send({ version: d.version, address: b })
        .expect(200)
    ).body.data;
    await resolve([b]);
    expect((await commit(d).expect(201)).body.data.importedCount).toBe(1);
    const target = await db.collection.findFirstOrThrow({
      where: { title: existing.title, id: { not: collectionId }, hubId: existing.hubId },
    });
    const items = await db.resource.findMany({
      where: { collectionId: target.id },
      orderBy: { position: "asc" },
    });
    expect(items.map((r) => r.titleOverride ?? r.url)).toEqual(["First", a, b]);
    expect(items[0].sectionDescription).toBeNull();
    const flat = await db.collection.findFirstOrThrow({
      where: { title: "Other", hubId: existing.hubId },
      include: { resources: { orderBy: { position: "asc" } } },
    });
    expect(flat.resources.map((r) => r.url)).toEqual([c]);
    expect(target.published).toBe(true);
    expect(await db.resource.count({ where: { collectionId } })).toBe(0);
    const resources = (
      await api()
        .get(`/api/v1/collections/${target.id}/resources`)
        .auth(token, { type: "bearer" })
        .expect(200)
    ).body.data;
    expect(resources[1].tags).toEqual(["css", "tools"]);
  });
  it("bounds commits to 100 links, rejects stale batches and preserves receipts after discard", async () => {
    const addresses = Array.from({ length: 101 }, () => url());
    const d = await draft([...addresses, "bad"]);
    await db.linkMetadata.updateMany({
      where: { url: { in: addresses } },
      data: { state: "ready", fetchedAt: new Date() },
    });
    const first = (await commit(d).expect(201)).body.data;
    expect(first.importedCount).toBe(100);
    expect(first.draft.counts).toMatchObject({ ready: 1, imported: 100, failed: 1 });
    await commit(d).expect(409);
    const second = (await commit(first.draft).expect(201)).body.data;
    expect(second.importedCount).toBe(1);
    expect(second.destinations[0].collectionId).toBe(first.destinations[0].collectionId);
    await api()
      .delete(`/api/v1/imports/${d.id}`)
      .auth(token, { type: "bearer" })
      .send({ version: second.draft.version })
      .expect(200);
    await api().get(`/api/v1/imports/${d.id}`).auth(token, { type: "bearer" }).expect(404);
    expect(
      await db.resource.count({ where: { collectionId: first.destinations[0].collectionId } }),
    ).toBe(101);
  }, 30000);
  it("requires an existing hub and hides drafts and rows from other accounts", async () => {
    const other = await person(false);
    await api()
      .post("/api/v1/imports")
      .auth(other.token, { type: "bearer" })
      .field("sourceKind", "text")
      .attach("file", Buffer.from(url()), "links.txt")
      .expect(400);
    expect(await db.hub.count({ where: { ownerUserId: other.id } })).toBe(0);
    const d = await draft([url()]);
    const [row] = await rows(d.id);
    await api().get(`/api/v1/imports/${d.id}`).auth(other.token, { type: "bearer" }).expect(404);
    await api()
      .patch(`/api/v1/imports/${d.id}/rows/${row.id}`)
      .auth(other.token, { type: "bearer" })
      .send({ version: d.version, address: url() })
      .expect(404);
    await api()
      .post(`/api/v1/imports/${d.id}/commit`)
      .auth(other.token, { type: "bearer" })
      .send({ version: d.version })
      .expect(404);
  });
  it("prevents stale destination commits and duplicate concurrent imports", async () => {
    const address = url();
    const d = await draft([address]);
    await resolve([address]);
    const responses = await Promise.all([commit(d), commit(d)]);
    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(responses.reduce((sum, r) => sum + r.body.data.importedCount, 0)).toBe(1);
    expect(await db.resource.count({ where: { url: address } })).toBe(1);
    const next = await draft([url()]);
    await api()
      .patch(`/api/v1/imports/${next.id}/rows/${(await rows(next.id))[0].id}`)
      .auth(token, { type: "bearer" })
      .send({ version: next.version, collectionTitle: "Changed" })
      .expect(200);
    await commit(next).expect(409);
  });
  it("rolls back resources, destinations and receipts when audit persistence fails", async () => {
    const address = url();
    const d = await draft([address]);
    await resolve([address]);
    // Failing audit writes inside the authority transaction must leave the draft reusable.
    await db.$executeRawUnsafe(
      "CREATE FUNCTION fail_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'item.link_added' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$",
    );
    await db.$executeRawUnsafe(
      "CREATE TRIGGER fail_import_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_import_audit()",
    );
    try {
      await commit(d).expect(500);
    } finally {
      await db.$executeRawUnsafe("DROP TRIGGER fail_import_audit ON audit_logs");
      await db.$executeRawUnsafe("DROP FUNCTION fail_import_audit()");
    }
    expect(await db.resource.count({ where: { url: address } })).toBe(0);
    expect((await read(d.id)).version).toBe(d.version);
    expect((await commit(d).expect(201)).body.data.importedCount).toBe(1);
  });
  it("stages 5,000 links with an existing lookup budget and rejects an oversized draft", async () => {
    await draft([url()]);
    const addresses = Array.from({ length: IMPORT_ROWS }, () => url());
    const created = await draft(addresses);
    expect(created.counts.looking_up).toBe(IMPORT_ROWS);
    expect(await db.importRow.count({ where: { draftId: created.id } })).toBe(IMPORT_ROWS);
    expect(
      (await db.requestBudget.findUniqueOrThrow({ where: { key: `import-lookups:${userId}` } }))
        .count,
    ).toBe(IMPORT_ROWS + 1);
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "text")
      .attach("file", Buffer.from([...addresses, url()].join("\n")), "too-many.txt")
      .expect(400);
    expect(await db.importDraft.count({ where: { userId } })).toBe(2);
  }, 15000);
  it("enforces draft, lookup and upload limits, pagination and private expiry cleanup", async () => {
    const first = await draft([url(), url(), url()]);
    await draft([url()]);
    await draft([url()]);
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "text")
      .attach("file", Buffer.from(url()), "links.txt")
      .expect(429);
    const page = await api()
      .get(`/api/v1/imports/${first.id}/rows?limit=2`)
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(page.body.data).toHaveLength(2);
    expect(
      (
        await api()
          .get(`/api/v1/imports/${first.id}/rows`)
          .query({ cursor: page.body.meta.nextCursor })
          .auth(token, { type: "bearer" })
          .expect(200)
      ).body.data,
    ).toHaveLength(1);
    await db.importDraft.update({ where: { id: first.id }, data: { expiresAt: new Date(0) } });
    await api().get(`/api/v1/imports/${first.id}`).auth(token, { type: "bearer" }).expect(404);
    await expireImportDrafts(db);
    expect(await db.importRow.count({ where: { draftId: first.id } })).toBe(0);
    await db.requestBudget.update({
      where: { key: `import-lookups:${userId}` },
      data: { count: IMPORT_LOOKUPS_PER_DAY },
    });
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "text")
      .attach("file", Buffer.from(url()), "links.txt")
      .expect(429);
    expect(await db.importDraft.count({ where: { userId } })).toBe(2);
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "csv")
      .attach("file", Buffer.alloc(10 * 1024 * 1024 + 1), "big.csv")
      .expect(413);
  });
  it("revalidates failed metadata and discards only draft state", async () => {
    const address = url();
    let d = await draft([address]);
    await resolve([address], false);
    expect((await read(d.id)).counts.failed).toBe(1);
    d = (
      await api()
        .post(`/api/v1/imports/${d.id}/revalidate`)
        .auth(token, { type: "bearer" })
        .send({ version: d.version })
        .expect(201)
    ).body.data;
    expect(d.counts.looking_up).toBe(1);
    await resolve([address]);
    const result = (await commit(d).expect(201)).body.data;
    await db.importDraft.update({ where: { id: d.id }, data: { expiresAt: new Date(0) } });
    await expireImportDrafts(db);
    expect(
      await db.resource.count({ where: { collectionId: result.destinations[0].collectionId } }),
    ).toBe(1);
  });
  it("keeps unfinished uploads outside authority and rechecks revoked sessions after parsing", async () => {
    const [parser] = Reflect.getMetadata(INTERCEPTORS_METADATA, ImportsController.prototype.create);
    const original = parser.prototype.intercept;
    let entered: () => void = () => {};
    const parsing = new Promise<void>((r) => {
      entered = r;
    });
    const spy = spyOn(parser.prototype, "intercept").mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      entered();
      return original.apply(this, args);
    });
    await app.listen(0, "127.0.0.1");
    const address = (app.getHttpServer() as http.Server).address();
    if (!address || typeof address === "string") throw new Error("Missing listener");
    const boundary = "slow-import";
    const upload = http.request({
      host: "127.0.0.1",
      port: address.port,
      method: "POST",
      path: "/api/v1/imports",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
    });
    const response = new Promise<number | undefined>((resolve, reject) => {
      upload.on("response", (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      upload.on("error", reject);
    });
    void response.catch(() => {});
    try {
      upload.write(
        `--${boundary}\r\nContent-Disposition: form-data; name="sourceKind"\r\n\r\ncsv\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.csv"\r\nContent-Type: text/csv\r\n\r\nurl\n${url()}\n`,
      );
      await parsing;
      const acquired = await db.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<
          Array<{ acquired: boolean }>
        >`SELECT pg_try_advisory_xact_lock(74201931) AS acquired`;
        if (row.acquired) await tx.session.deleteMany({ where: { userId } });
        return row.acquired;
      });
      expect(acquired).toBe(true);
      upload.end(`\r\n--${boundary}--\r\n`);
      expect(await response).toBe(401);
    } finally {
      upload.destroy();
      spy.mockRestore();
    }
  });
});

it("derives top-level collections and lets one row change placement without renaming its siblings", async () => {
  const a = url(),
    b = url(),
    c = url();
  const html = `<DL><DT><H3>Engineering</H3><DL><DT><H3>C</H3><DL><DT><A HREF="${a}">A</A><DT><A HREF="${b}">B</A></DL><DT><A HREF="${c}">C</A></DL><DT><A HREF="bad">Bad</A></DL>`;
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "bookmarks")
      .attach("file", Buffer.from(html), "bookmarks.html")
      .expect(201)
  ).body.data;
  let list = await rows(d.id);
  expect(list[0]).toMatchObject({
    collectionTitle: "Engineering",
    sectionTitle: "C",
  });
  expect(list[2]).toMatchObject({ collectionTitle: "Engineering", sectionTitle: "" });
  const edit = async (rowId: string, placement: Record<string, string>, expected = 200) =>
    api()
      .patch(`/api/v1/imports/${d.id}/rows/${rowId}`)
      .auth(token, { type: "bearer" })
      .send({ version: (await read(d.id)).version, ...placement })
      .expect(expected);
  await edit(list[0].id, { collectionTitle: "Reading", sectionTitle: "Later" });
  list = await rows(d.id);
  expect(list[0]).toMatchObject({ collectionTitle: "Reading", sectionTitle: "Later" });
  expect(list[1]).toMatchObject({
    collectionTitle: "Engineering",
    sectionTitle: "C",
  });
  await edit(list[1].id, { collectionTitle: "Reading", sectionTitle: "Later" });
  list = await rows(d.id);
  expect(list[1].folderId).toBe(list[0].folderId);
  await resolve([a]);
  await commit(await read(d.id)).expect(201);
  const receipt = await db.resource.findFirstOrThrow({ where: { url: a } });
  // The second row becomes flat after the first row's section has been saved.
  await edit(list[1].id, { collectionTitle: "Reading", sectionTitle: "" });
  await resolve([b]);
  await commit(await read(d.id)).expect(201);
  const content = await db.resource.findMany({
    where: { collectionId: receipt.collectionId },
    orderBy: { position: "asc" },
  });
  expect(content.map((r) => r.url ?? r.titleOverride)).toEqual([b, "Later", a]);
  await edit(list[2].id, { collectionTitle: "Reading", sectionTitle: "Later" });
  list = await rows(d.id);
  expect(list[0]).toMatchObject({
    status: "imported",
    collectionTitle: "Reading",
    sectionTitle: "Later",
    targetCollectionId: receipt.collectionId,
  });
  expect(list[1]).toMatchObject({
    status: "imported",
    collectionTitle: "Reading",
    sectionTitle: "",
  });
  expect(list[2]).toMatchObject({ collectionTitle: "Reading", sectionTitle: "Later" });
  await edit(list[2].id, { collectionTitle: "bad\0name" }, 400);
  await edit(list[2].id, { sectionTitle: "bad\0name" }, 400);
  const other = await person();
  await api()
    .get(`/api/v1/imports/${d.id}/rows/${list[2].id}`)
    .auth(other.token, { type: "bearer" })
    .expect(404);
  await api()
    .get(`/api/v1/imports/${d.id}/rows/${randomUUID()}`)
    .auth(token, { type: "bearer" })
    .expect(404);
});

it("keeps prescribed CSV placement immutable through the row editor", async () => {
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "csv")
      .attach("file", Buffer.from(`collection,section,url,tags\nLibrary,,${url()},\n`), "links.csv")
      .expect(201)
  ).body.data;
  const [row] = await rows(d.id);
  await api()
    .patch(`/api/v1/imports/${d.id}/rows/${row.id}`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, collectionTitle: "Changed" })
    .expect(400);
  await api()
    .patch(`/api/v1/imports/${d.id}/rows/${row.id}`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, collectionTitle: "Library", sectionTitle: "", tags: ["reference"] })
    .expect(200);
  expect((await rows(d.id))[0]).toMatchObject({
    collectionTitle: "Library",
    sectionTitle: "",
    tags: ["reference"],
  });
});

it("accepts unchanged CSV placement after the saved collection was renamed", async () => {
  const address = url();
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "csv")
      .attach(
        "file",
        Buffer.from(
          `collection,section,url,tags\nLibrary,,${address},\nLibrary,,invalid-address,\n`,
        ),
        "links.csv",
      )
      .expect(201)
  ).body.data;
  await resolve([address]);
  await commit(await read(d.id)).expect(201);
  const saved = await db.resource.findFirstOrThrow({ where: { url: address } });
  await db.collection.update({
    where: { id: saved.collectionId },
    data: { title: "Renamed library" },
  });
  const row = (await rows(d.id)).find((r: { status: string }) => r.status === "failed");
  expect(row.collectionTitle).toBe("Renamed library");
  await api()
    .patch(`/api/v1/imports/${d.id}/rows/${row.id}`)
    .auth(token, { type: "bearer" })
    .send({
      version: (await read(d.id)).version,
      collectionTitle: row.collectionTitle,
      sectionTitle: row.sectionTitle,
      address: url(),
    })
    .expect(200);
});

it("revalidates selected failed rows with owner and revision checks", async () => {
  const a = url(),
    b = url();
  const d = await draft([a, b]);
  await resolve([a, b], false);
  const [row] = await rows(d.id);
  const endpoint = `/api/v1/imports/${d.id}/selection`;
  const other = await person();
  await api()
    .post(endpoint)
    .auth(other.token, { type: "bearer" })
    .send({ version: d.version, rowIds: [row.id], action: "revalidate" })
    .expect(404);
  await api()
    .post(`/api/v1/imports/${d.id}/selection`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, rowIds: [randomUUID()], action: "revalidate" })
    .expect(404);
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, rowIds: [row.id], action: "revalidate" })
    .expect(201);
  expect((await read(d.id)).counts).toMatchObject({ looking_up: 1, failed: 1 });
  expect(await db.linkMetadata.findUniqueOrThrow({ where: { url: a } })).toMatchObject({
    state: "pending",
    attempts: 0,
  });
  expect((await db.linkMetadata.findUniqueOrThrow({ where: { url: b } })).attempts).toBeGreaterThan(
    0,
  );
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, rowIds: [row.id], action: "revalidate" })
    .expect(409);
  await resolve([a]);
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: (await read(d.id)).version, rowIds: [row.id], action: "revalidate" })
    .expect(409);
  await commit(await read(d.id)).expect(201);
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: (await read(d.id)).version, rowIds: [row.id], action: "revalidate" })
    .expect(409);
});

it("turns browser branches into named collections and preserves reference order across partial commits", async () => {
  const loose = url(),
    direct = url(),
    a = url(),
    b = url(),
    leaf = url();
  const html = `<DL><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3><DL><A HREF="${loose}">Loose</A><H3>Library</H3><DL><A HREF="${direct}">Direct</A><H3>First branch</H3><DL><H3>First leaf</H3><DL><A HREF="bad">Repair</A></DL></DL><H3>Second branch</H3><DL><H3>Second leaf</H3><DL><A HREF="${b}">B</A></DL></DL><H3>Reading</H3><DL><A HREF="${leaf}">L</A></DL><H3>Empty</H3><DL></DL></DL></DL></DL>`;
  let d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "bookmarks")
      .attach("file", Buffer.from(html), "bookmarks.html")
      .expect(201)
  ).body.data;
  expect(d.unassignedCount).toBe(1);
  expect(d.folders.map((f: { name: string }) => f.name)).not.toContain("Bookmarks bar");
  await resolve([loose, direct, b, leaf]);
  let list = await rows(d.id);
  expect(list[0]).toMatchObject({
    collectionTitle: "",
    reason: "collection_required",
    status: "failed",
  });
  expect(list.find((r: { address: string }) => r.address === b)).toMatchObject({
    collectionTitle: "Second branch",
    sectionTitle: "Second leaf",
  });
  // Child success creates its ancestors even before their own links are ready.
  await db.linkMetadata.update({ where: { url: direct }, data: { state: "pending" } });
  d = (await commit(d).expect(201)).body.data.draft;
  const hub = await db.hub.findUniqueOrThrow({ where: { ownerUserId: userId } });
  const library = await db.collection.findFirstOrThrow({
    where: { hubId: hub.id, title: "Library" },
  });
  expect(
    await db.collection.count({
      where: {
        hubId: hub.id,
        title: { in: ["Bookmarks bar", "Imported links", "First branch", "Empty"] },
      },
    }),
  ).toBe(0);
  list = await rows(d.id);
  const repair = list.find((r: { address: string }) => r.address === "bad");
  d = (
    await api()
      .patch(`/api/v1/imports/${d.id}/rows/${repair.id}`)
      .auth(token, { type: "bearer" })
      .send({ version: d.version, address: a })
      .expect(200)
  ).body.data;
  await resolve([a]);
  await db.linkMetadata.update({ where: { url: direct }, data: { state: "ready" } });
  d = (await commit(d).expect(201)).body.data.draft;
  const content = await db.resource.findMany({
    where: { collectionId: library.id },
    orderBy: { position: "asc" },
    include: { linkedCollection: true },
  });
  expect(content.map((r) => r.url ?? r.titleOverride ?? r.linkedCollection?.title)).toEqual([
    direct,
    "First branch",
    "Second branch",
    "Reading",
    leaf,
  ]);
  expect(content.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
  expect(content.filter((r) => r.kind === "collection_link")).toHaveLength(2);
  const other = await person();
  await api()
    .patch(`/api/v1/imports/${d.id}/destination`)
    .auth(other.token, { type: "bearer" })
    .send({ version: d.version, collectionTitle: "Library" })
    .expect(404);
  await api()
    .patch(`/api/v1/imports/${d.id}/destination`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version - 1, collectionTitle: "Library" })
    .expect(409);
  d = (
    await api()
      .patch(`/api/v1/imports/${d.id}/destination`)
      .auth(token, { type: "bearer" })
      .send({ version: d.version, collectionTitle: "Library" })
      .expect(200)
  ).body.data;
  expect(d.unassignedCount).toBe(0);
  d = (await commit(d).expect(201)).body.data.draft;
  expect(d.closed).toBe(true);
  expect((await commit(d).expect(201)).body.data.importedCount).toBe(0);
  expect(
    await db.resource.count({ where: { collectionId: library.id, kind: "collection_link" } }),
  ).toBe(2);
  expect(await db.resource.count({ where: { collectionId: library.id, url: loose } })).toBe(1);
});

it("rechecks deleted and transferred destinations and repairs placement without moving saved rows", async () => {
  for (const removed of ["deleted", "transferred"]) {
    const a = url(),
      b = url();
    let d = await draft([a, b]);
    await resolve([a]);
    d = (await commit(d).expect(201)).body.data.draft;
    const saved = await db.resource.findFirstOrThrow({ where: { url: a } });
    if (removed === "deleted") await db.collection.delete({ where: { id: saved.collectionId } });
    else {
      const other = await person();
      const hub = await db.hub.findUniqueOrThrow({ where: { ownerUserId: other.id } });
      await db.collection.update({ where: { id: saved.collectionId }, data: { hubId: hub.id } });
    }
    await resolve([b]);
    const list = await rows(d.id);
    expect(list[0].status).toBe("imported");
    expect(list[1]).toMatchObject({ status: "failed", reason: "destination_unavailable" });
    expect((await commit(d).expect(201)).body.data.importedCount).toBe(0);
    d = (
      await api()
        .patch(`/api/v1/imports/${d.id}/rows/${list[1].id}`)
        .auth(token, { type: "bearer" })
        .send({ version: (await read(d.id)).version, collectionTitle: "Recovered" })
        .expect(200)
    ).body.data;
    expect((await commit(d).expect(201)).body.data.importedCount).toBe(1);
    expect((await db.resource.findFirstOrThrow({ where: { url: b } })).collectionId).not.toBe(
      saved.collectionId,
    );
  }
});

it("imports through a single-reference folder chain without creating empty intermediary collections", async () => {
  const address = url();
  const html = `<DL><H3>res</H3><DL><H3>links</H3><DL><H3>ai</H3><DL><A HREF="${address}">A</A></DL></DL></DL></DL>`;
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "bookmarks")
      .attach("file", Buffer.from(html), "bookmarks.html")
      .expect(201)
  ).body.data;
  expect((await rows(d.id))[0]).toMatchObject({ collectionTitle: "links", sectionTitle: "ai" });
  await resolve([address]);
  const result = (await commit(d).expect(201)).body.data;
  const hub = await db.hub.findUniqueOrThrow({ where: { ownerUserId: userId } });
  const created = await db.collection.findMany({
    where: { hubId: hub.id, id: { not: collectionId } },
    include: { resources: { orderBy: { position: "asc" } } },
  });
  expect(created.map((c) => c.title)).toEqual(["links"]);
  expect(created[0].resources.map((r) => r.titleOverride ?? r.url)).toEqual(["ai", address]);
  expect(result.importedCount).toBe(1);
  expect((await commit(result.draft).expect(201)).body.data.importedCount).toBe(0);
});

it("removes only selected pending rows and rejects foreign or invalid selections atomically", async () => {
  const d = await draft([url(), url(), url()]);
  const list = await rows(d.id);
  const foreign = await draft([url()]);
  const [outside] = await rows(foreign.id);
  const endpoint = `/api/v1/imports/${d.id}/selection`;
  for (const ids of [
    [],
    [list[0].id, list[0].id],
    Array.from({ length: 51 }, () => randomUUID()),
  ]) {
    await api()
      .post(endpoint)
      .auth(token, { type: "bearer" })
      .send({ version: d.version, rowIds: ids, action: "remove" })
      .expect(400);
  }
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, rowIds: [list[0].id, outside.id], action: "remove" })
    .expect(404);
  expect((await rows(d.id)).every((r) => r.status !== "skipped")).toBe(true);
  const response = await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, rowIds: [list[0].id, list[2].id], action: "remove" })
    .expect(201);
  expect(response.body.data.rows.map((r: { status: string }) => r.status)).toEqual([
    "skipped",
    "skipped",
  ]);
  expect(response.body.data.draft.version).toBe(d.version + 1);
  expect((await rows(d.id))[1].status).not.toBe("skipped");
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, rowIds: [list[1].id], action: "remove" })
    .expect(409);
});

it("queues collection ready links across pages, preserves publication choices and resumes batches", async () => {
  const addresses = Array.from({ length: 105 }, () => url());
  const failed = url(),
    pending = url(),
    other = url();
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "csv")
      .attach(
        "file",
        Buffer.from(
          [
            "collection,section,url,tags",
            ...addresses.map((a) => `One,,${a},`),
            `One,,${failed},`,
            `One,,${pending},`,
            `One,,${addresses[0]},`,
            `Two,,${other},`,
            `Two,,${other},`,
          ].join("\n"),
        ),
        "collections.csv",
      )
      .expect(201)
  ).body.data;
  await db.linkMetadata.updateMany({
    where: { url: { in: [...addresses, other] } },
    data: { state: "ready", fetchedAt: new Date(), title: "Resolved page" },
  });
  await resolve([failed], false);
  const one = d.collections.find((c) => c.title === "One");
  const two = d.collections.find((c) => c.title === "Two");
  expect(one.published).toBe(true);
  const endpoint = `/api/v1/imports/${d.id}/collections/${one.id}`;
  const unpublished = (
    await api()
      .patch(endpoint)
      .auth(token, { type: "bearer" })
      .send({ version: d.version, published: false })
      .expect(200)
  ).body.data;
  expect(unpublished.counts).toMatchObject({ ready: 105, failed: 1, looking_up: 1 });
  expect(unpublished.collections.find((c) => c.id === two.id).published).toBe(true);
  const queued = (
    await api()
      .post(`${endpoint}/commit`)
      .auth(token, { type: "bearer" })
      .send({ version: unpublished.version })
      .expect(201)
  ).body.data;
  expect(queued.collections.find((c) => c.id === one.id).jobState).toBe("queued");
  expect(await db.resource.count({ where: { url: { in: addresses } } })).toBe(0);
  await api()
    .post(`${endpoint}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: unpublished.version })
    .expect(201);
  await api()
    .patch(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: queued.version, published: true })
    .expect(409);
  const scoped = (
    await api()
      .get(`/api/v1/imports/${d.id}/rows?collectionId=${one.id}&limit=100`)
      .auth(token, { type: "bearer" })
      .expect(200)
  ).body;
  expect(scoped.data).toHaveLength(100);
  expect(scoped.data.every((r) => r.collectionKey === one.id)).toBe(true);
  await api()
    .patch(`/api/v1/imports/${d.id}/rows/${scoped.data[0].id}`)
    .auth(token, { type: "bearer" })
    .send({ version: queued.version, tags: ["changed"] })
    .expect(409);
  const service = app.get(ImportsService);
  await service.runJobBatch();
  expect(await db.resource.count({ where: { url: { in: addresses } } })).toBe(100);
  const middle = await read(d.id);
  expect(middle.collections.find((c) => c.id === one.id).jobState).toBe("running");
  // A new service instance can continue persisted work, with concurrent runners
  // serializing receipts rather than duplicating them.
  await Promise.all([importJobService(db).runJobBatch(), service.runJobBatch()]);
  const done = await read(d.id),
    completed = done.collections.find((c) => c.id === one.id);
  expect(completed.jobState).toBe("completed");
  expect(completed.counts).toMatchObject({ imported: 105, failed: 1, looking_up: 1, skipped: 1 });
  expect(done.closed).toBe(false);
  expect(done.collections.find((c) => c.id === two.id).counts).toMatchObject({
    ready: 1,
    duplicate: 1,
    skipped: 0,
  });
  expect(await db.resource.count({ where: { url: other } })).toBe(0);
  expect(
    (await db.collection.findUniqueOrThrow({ where: { id: completed.targetCollectionId } }))
      .published,
  ).toBe(false);
  await api()
    .get(`/api/v1/imports/${d.id}/collections/${randomUUID()}`)
    .auth(token, { type: "bearer" })
    .expect(404);
  const stranger = await person();
  await api().get(endpoint).auth(stranger.token, { type: "bearer" }).expect(404);
  await api()
    .post(`/api/v1/imports/${d.id}/collections/${two.id}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: done.version })
    .expect(201);
  await service.runJobBatch();
  const savedOther = await db.resource.findFirstOrThrow({
    where: { url: other },
    include: { collection: true },
  });
  expect(savedOther.collection.published).toBe(true);
  // Late metadata becomes a later job in the same existing destination.
  await resolve([pending]);
  const later = await read(d.id);
  await api()
    .post(`${endpoint}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: later.version })
    .expect(201);
  await service.runJobBatch();
  expect((await db.resource.findFirstOrThrow({ where: { url: pending } })).collectionId).toBe(
    completed.targetCollectionId,
  );
  expect(
    (await db.collection.findUniqueOrThrow({ where: { id: completed.targetCollectionId } }))
      .published,
  ).toBe(false);
}, 30000);

it("assigns a collection only to selected unfiled links and reuses that destination", async () => {
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "text")
      .attach("file", Buffer.from([url(), url(), url()].join("\n")), "links.txt")
      .expect(201)
  ).body.data;
  const list = await rows(d.id);
  const endpoint = `/api/v1/imports/${d.id}/selection`;
  for (const collectionTitle of [undefined, "", "   ", "bad\0name"]) {
    await api()
      .post(endpoint)
      .auth(token, { type: "bearer" })
      .send({
        version: d.version,
        rowIds: [list[0].id],
        action: "place",
        collectionTitle,
      })
      .expect(400);
  }
  const changed = (
    await api()
      .post(endpoint)
      .auth(token, { type: "bearer" })
      .send({
        version: d.version,
        rowIds: [list[0].id, list[1].id],
        action: "place",
        collectionTitle: "Reading",
      })
      .expect(201)
  ).body.data.draft;
  expect(changed.unassignedCount).toBe(1);
  const after = await rows(d.id);
  expect(after.map((r) => r.collectionTitle)).toEqual(["Reading", "Reading", ""]);
  expect(after[0].folderId).toBe(after[1].folderId);
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({
      version: changed.version,
      rowIds: [list[0].id, list[2].id],
      action: "place",
      collectionTitle: "Other",
    })
    .expect(409);
  expect((await read(d.id)).unassignedCount).toBe(1);
  await api()
    .post(endpoint)
    .auth(token, { type: "bearer" })
    .send({
      version: changed.version,
      rowIds: [list[2].id],
      action: "place",
      collectionTitle: "Reading",
    })
    .expect(201);
  expect((await rows(d.id)).every((r) => r.folderId === after[0].folderId)).toBe(true);
  expect((await read(d.id)).unassignedCount).toBe(0);
});

it("rolls back a failed job batch and retries without losing the publishing choice", async () => {
  const address = url();
  const d = await draft([address]);
  await resolve([address]);
  const folder = d.collections[0];
  const endpoint = `/api/v1/imports/${d.id}/collections/${folder.id}`;
  await api()
    .post(`${endpoint}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version, published: false })
    .expect(201);
  const service = app.get(ImportsService);
  const commit = service.commit.bind(service);
  const failure = spyOn(service, "commit").mockImplementationOnce(async (...args) => {
    await commit(...args);
    throw new Error("batch failure after resource creation");
  });
  try {
    await service.runJobBatch();
  } finally {
    failure.mockRestore();
  }
  expect(await db.resource.count({ where: { url: address } })).toBe(0);
  const failed = await read(d.id);
  expect(failed.collections[0]).toMatchObject({
    jobState: "failed",
    published: false,
    targetCollectionId: null,
  });
  await api()
    .post(`${endpoint}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: failed.version })
    .expect(201);
  await service.runJobBatch();
  const completed = await read(d.id);
  expect(completed.collections[0]).toMatchObject({ jobState: "completed", published: false });
  await api()
    .delete(endpoint)
    .auth(token, { type: "bearer" })
    .send({ version: completed.version })
    .expect(200);
  expect((await read(d.id)).collections).toHaveLength(0);
  expect(await db.resource.count({ where: { url: address } })).toBe(1);
});

it("closes a collection job with duplicate URLs and releases the open-draft slot", async () => {
  const address = url();
  const d = await draft([address, address]);
  await resolve([address]);
  await api()
    .post(`/api/v1/imports/${d.id}/collections/${d.collections[0].id}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version })
    .expect(201);
  expect(await app.get(ImportsService).runJobBatch()).toBe(true);
  const completed = await read(d.id);
  expect(completed.closed).toBe(true);
  expect(completed.collections[0].jobState).toBe("completed");
  expect(completed.counts).toMatchObject({ imported: 1, skipped: 1, already_saved: 0 });
  expect(await db.resource.count({ where: { url: address } })).toBe(1);
  expect(await db.importDraft.count({ where: { userId, closed: false } })).toBe(0);
});

it("keeps unfiled links reviewable when naming a discarded destination", async () => {
  const removed = url(),
    unfiled = url();
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "bookmarks")
      .attach(
        "file",
        Buffer.from(
          `<DL><DT><A HREF="${unfiled}">Unfiled</A><DT><H3>Reading</H3><DL><DT><A HREF="${removed}">Removed</A></DL></DL>`,
        ),
        "bookmarks.html",
      )
      .expect(201)
  ).body.data;
  const discarded = d.collections.find((c) => c.title === "Reading");
  await api()
    .delete(`/api/v1/imports/${d.id}/collections/${discarded.id}`)
    .auth(token, { type: "bearer" })
    .send({ version: d.version })
    .expect(200);
  const current = await read(d.id);
  const assigned = (
    await api()
      .patch(`/api/v1/imports/${d.id}/destination`)
      .auth(token, { type: "bearer" })
      .send({ version: current.version, collectionTitle: "Reading" })
      .expect(200)
  ).body.data;
  expect(assigned.collections).toHaveLength(1);
  expect(assigned.collections[0].title).toBe("Reading");
  expect(assigned.collections[0].id).not.toBe(discarded.id);
  const list = await rows(d.id);
  expect(list.find((r) => r.address === unfiled).collectionKey).toBe(assigned.collections[0].id);
  expect(list.find((r) => r.address === removed).status).toBe("skipped");
  await resolve([unfiled]);
  await api()
    .post(`/api/v1/imports/${d.id}/collections/${assigned.collections[0].id}/commit`)
    .auth(token, { type: "bearer" })
    .send({ version: assigned.version })
    .expect(201);
  expect(await app.get(ImportsService).runJobBatch()).toBe(true);
  expect((await read(d.id)).closed).toBe(true);
  expect(await db.resource.count({ where: { url: removed } })).toBe(0);
  expect(await db.resource.count({ where: { url: unfiled } })).toBe(1);
});

for (const discardParent of [false, true]) {
  it(`preserves bookmark ancestry after discarding unfiled links${discardParent ? " and their parent collection" : ""}`, async () => {
    const loose = url(),
      first = url(),
      second = url();
    const html = `<DL><H3 PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3><DL><A HREF="${loose}">Loose</A><H3>Library</H3><DL><H3>First branch</H3><DL><H3>First leaf</H3><DL><A HREF="${first}">First</A></DL></DL><H3>Second branch</H3><DL><H3>Second leaf</H3><DL><A HREF="${second}">Second</A></DL></DL></DL></DL></DL>`;
    let d = (
      await api()
        .post("/api/v1/imports")
        .auth(token, { type: "bearer" })
        .field("sourceKind", "bookmarks")
        .attach("file", Buffer.from(html), "bookmarks.html")
        .expect(201)
    ).body.data;
    const root = d.folders.find((f) => f.parentId === null);
    const library = d.collections.find((c) => c.title === "Library");
    for (const id of discardParent ? [root.id, library.id] : [root.id]) {
      await api()
        .delete(`/api/v1/imports/${d.id}/collections/${id}`)
        .auth(token, { type: "bearer" })
        .send({ version: d.version })
        .expect(200);
      d = await read(d.id);
    }
    expect(d.collections.some((c) => c.id === root.id)).toBe(false);
    expect((await rows(d.id)).find((r) => r.address === loose).status).toBe("skipped");
    expect(d.folders.filter((f) => f.parentId === null).map((f) => f.id)).toEqual([root.id]);
    await resolve([first, second]);
    // Import the later branch first to exercise ancestor creation and ordered replay.
    for (const title of ["Second branch", "First branch"]) {
      const branch = d.collections.find((c) => c.title === title);
      await api()
        .post(`/api/v1/imports/${d.id}/collections/${branch.id}/commit`)
        .auth(token, { type: "bearer" })
        .send({ version: d.version })
        .expect(201);
      expect(await app.get(ImportsService).runJobBatch()).toBe(true);
      d = await read(d.id);
    }
    expect(d.closed).toBe(true);
    expect(d.counts).toMatchObject({ imported: 2, skipped: 1 });
    expect(await db.resource.count({ where: { url: loose } })).toBe(0);
    const hub = await db.hub.findUniqueOrThrow({ where: { ownerUserId: userId } });
    const saved = await db.collection.findMany({
      where: { hubId: hub.id, id: { not: collectionId } },
      include: {
        resources: { orderBy: { position: "asc" }, include: { linkedCollection: true } },
      },
    });
    expect(saved.map((c) => c.title).sort()).toEqual(
      (discardParent
        ? ["First branch", "Second branch"]
        : ["First branch", "Library", "Second branch"]
      ).sort(),
    );
    if (!discardParent)
      expect(
        saved.find((c) => c.title === "Library")?.resources.map((r) => r.linkedCollection?.title),
      ).toEqual(["First branch", "Second branch"]);
    for (const [title, address] of [
      ["First branch", first],
      ["Second branch", second],
    ])
      expect(
        saved
          .find((c) => c.title === title)
          ?.resources.map((r) => r.url)
          .filter(Boolean),
      ).toEqual([address]);
    expect((await commit(d).expect(201)).body.data.importedCount).toBe(0);
  });
}

it("repairs 100 early sections ahead of 4,900 saved links in one bounded collection batch", async () => {
  const addresses = Array.from({ length: 5000 }, () => url());
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "csv")
      .attach(
        "file",
        Buffer.from(
          `collection,section,url,tags\n${addresses.map((address, i) => `Scale,${i < 100 ? `Section ${i}` : "Saved"},${address},`).join("\n")}`,
        ),
        "scale.csv",
      )
      .expect(201)
  ).body.data;
  const dest = d.folders.find((f) => f.newTitle === "Scale" && f.mode === "collection");
  const savedFolder = d.folders.find((f) => f.name === "Saved");
  // Simulate the receipts of prior batches; only the 100 earlier sections remain.
  await db.importFolder.update({
    where: { id: dest.id },
    data: { targetCollectionId: collectionId },
  });
  const heading = await db.resource.create({
    data: {
      collectionId,
      kind: "heading",
      titleOverride: "Saved",
      position: 0,
    },
  });
  await db.importFolder.update({ where: { id: savedFolder.id }, data: { headingId: heading.id } });
  await db.resource.createMany({
    data: addresses.slice(100).map((address, i) => ({
      collectionId,
      kind: "external_link",
      url: address,
      position: i + 1,
    })),
  });
  await db.$executeRaw`
    UPDATE import_rows AS row SET resource_id = r.id
    FROM resources AS r
    WHERE row.draft_id = ${d.id}::uuid AND r.collection_id = ${collectionId}::uuid AND row.url = r.url
  `;
  await db.linkMetadata.updateMany({
    where: { url: { in: addresses.slice(0, 100) } },
    data: { state: "ready" },
  });
  const failure = spyOn(app.get(ResourcesService), "record").mockImplementationOnce(async () => {
    throw new Error("audit failure after bulk position shifts");
  });
  try {
    await commit(d).expect(500);
  } finally {
    failure.mockRestore();
  }
  const rolledBack = await db.resource.findMany({
    where: { collectionId },
    orderBy: { position: "asc" },
  });
  expect(rolledBack).toHaveLength(4901);
  expect(rolledBack.every((r, i) => r.position === i && r.version === 1n)).toBe(true);
  const result = (await commit(d).expect(201)).body.data;
  expect(result.importedCount).toBe(100);
  expect(result.draft.closed).toBe(true);
  const items = await db.resource.findMany({
    where: { collectionId },
    orderBy: { position: "asc" },
  });
  expect(items).toHaveLength(5101);
  expect(items.map((r) => r.position)).toEqual(Array.from({ length: 5101 }, (_, i) => i));
  expect(items.slice(0, 200).map((r) => r.titleOverride ?? r.url)).toEqual(
    addresses.slice(0, 100).flatMap((address, i) => [`Section ${i}`, address]),
  );
  expect(items[200].id).toBe(heading.id);
  expect(items.slice(201).map((r) => r.url)).toEqual(addresses.slice(100));
  expect(items.slice(200).every((r) => r.version === 2n)).toBe(true);
  expect((await commit(result.draft).expect(201)).body.data.importedCount).toBe(0);
}, 60000);

it("keeps new flat rows before new sections from folders sharing a destination", async () => {
  const sectionUrl = url(),
    flatUrl = url();
  const d = (
    await api()
      .post("/api/v1/imports")
      .auth(token, { type: "bearer" })
      .field("sourceKind", "csv")
      .attach(
        "file",
        Buffer.from(
          `collection,section,url,tags\nFirst,Section,${sectionUrl},\nSecond,,${flatUrl},\n`,
        ),
        "links.csv",
      )
      .expect(201)
  ).body.data;
  await db.importFolder.updateMany({
    where: { draftId: d.id, mode: "collection", parentId: { not: null } },
    data: { targetCollectionId: collectionId },
  });
  await resolve([sectionUrl, flatUrl]);
  await commit(d).expect(201);
  const items = await db.resource.findMany({
    where: { collectionId },
    orderBy: { position: "asc" },
  });
  expect(items.map((r) => r.url ?? r.titleOverride)).toEqual([flatUrl, "Section", sectionUrl]);
});
