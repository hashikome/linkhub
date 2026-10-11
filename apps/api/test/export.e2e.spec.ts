import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { unzipSync } from "fflate";
import request, { Response as SupertestResponse } from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

// Collects binary bodies (pdf/docx/zip) that supertest would otherwise drop.
function binaryParser(res: SupertestResponse, callback: (err: null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

// Locks synchronous export: one request, the response body IS the file.
// References stay links by default; explicit expansion is independently authorized
// and bounded to one level. Multiple selected collections return a zip.
describe("Export (e2e)", () => {
  let app: INestApplication<App>;
  let bearer: string;
  let otherBearer: string;
  let guide: string;
  let section: string;
  const sfx = Date.now().toString(36);

  const signUp = async (email: string, name: string) => {
    const res = await signInWithCode(app.getHttpServer(), { email, name });
    return res.headers["set-auth-token"];
  };
  const createCollection = async (slug: string) => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ slug, title: slug, published: false })
      .expect(201);
    return (res.body as { data: { id: string } }).data.id;
  };
  const addLink = (collectionId: string, url: string, position: number) =>
    request(app.getHttpServer())
      .post(`/api/v1/collections/${collectionId}/resources/external`)
      .set("Authorization", `Bearer ${bearer}`)
      .send({ url, position });
  const exportAs = (body: Record<string, unknown>, token = bearer) =>
    request(app.getHttpServer())
      .post("/api/v1/exports")
      .set("Authorization", `Bearer ${token}`)
      .send(body)
      .buffer(true)
      .parse(binaryParser);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<INestApplication<App>>({ bodyParser: false });
    configureApp(app);
    await app.init();
    bearer = await signUp(`exp_${sfx}@example.com`, `exp ${sfx}`);
    otherBearer = await signUp(`exp2_${sfx}@example.com`, `exp2 ${sfx}`);

    guide = await createCollection(`guide-${sfx}`);
    section = await createCollection(`section-${sfx}`);
    await addLink(guide, `https://fixture-links.dev/top-${sfx}`, 0).expect(201);
    await addLink(section, `https://fixture-links.dev/sec-${sfx}`, 0).expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${guide}/resources/collection`)
      .set("Authorization", `Bearer ${bearer}`)
      .send({ linkedCollectionId: section, position: 1 })
      .expect(201);
  });

  beforeEach(async () => {
    // Each export scenario gets its own budget; rate limiting is tested separately.
    await app.get(PrismaService).requestBudget.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  }, 15000);

  it("exports one collection as markdown, expanding linked collections explicitly", async () => {
    const res = await exportAs({ format: "markdown", collectionIds: [guide], expand: true }).expect(
      201,
    );
    expect(res.headers["content-type"]).toContain("text/markdown");
    expect(res.headers["content-disposition"]).toContain(`guide-${sfx}.md`);
    const content = (res.body as Buffer).toString("utf8");
    expect(content).toContain(`# guide-${sfx}`);
    expect(content).toContain(`## section-${sfx}`);
    expect(content).toContain(`https://fixture-links.dev/top-${sfx}`);
    expect(content).toContain(`https://fixture-links.dev/sec-${sfx}`);
  });

  it("renders exports outside the global write lock", async () => {
    // Hold the authority lock the way a long write would; a read-only export
    // must still complete instead of queueing behind it or timing out.
    await app.get(PrismaService).$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(74201931)`;
        const started = Date.now();
        await exportAs({ format: "markdown", collectionIds: [guide] }).expect(201);
        expect(Date.now() - started).toBeLessThan(5000);
      },
      { timeout: 20000 },
    );
  }, 25000);

  it("keeps referenced collections as links by default", async () => {
    const res = await exportAs({
      format: "markdown",
      collectionIds: [guide],
    }).expect(201);
    const content = (res.body as Buffer).toString("utf8");
    expect(content).not.toContain(`## section-${sfx}`);
    expect(content).not.toContain(`https://fixture-links.dev/sec-${sfx}`);
    const webOrigin =
      process.env.WEB_ORIGIN || process.env.BETTER_AUTH_URL || "http://localhost:3004";
    expect(content).toContain(`[section-${sfx}](<${webOrigin}/c/${section}>)`);
  });

  it("zips the documents when several collections are selected", async () => {
    const res = await exportAs({ format: "markdown", collectionIds: [guide, section] }).expect(201);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect((res.body as Buffer).subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("renders pdf and docx", async () => {
    const pdf = await exportAs({ format: "pdf", collectionIds: [guide] }).expect(201);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect((pdf.body as Buffer).subarray(0, 4).toString("latin1")).toBe("%PDF");

    const docx = await exportAs({ format: "docx", collectionIds: [guide] }).expect(201);
    expect(docx.headers["content-type"]).toContain("wordprocessingml");
    expect((docx.body as Buffer).subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("preserves ordered headings and bounds cyclic guide expansion in every format", async () => {
    const a = await createCollection(`guide-order-${sfx}`);
    const b = await createCollection(`topic-order-${sfx}`);
    const heading = (id: string, title: string, first: { id: string; version: number }) =>
      request(app.getHttpServer())
        .post(`/api/v1/collections/${id}/resources/heading`)
        .auth(bearer, { type: "bearer" })
        .send({
          title,
          description: "Context for this section.",
          firstItemId: first.id,
          firstItemVersion: first.version,
        })
        .expect(201);
    const reference = (source: string, target: string, position: number) =>
      request(app.getHttpServer())
        .post(`/api/v1/collections/${source}/resources/collection`)
        .auth(bearer, { type: "bearer" })
        .send({ linkedCollectionId: target, position })
        .expect(201);
    const firstA = await addLink(a, "https://fixture-links.dev/start", 0).expect(201);
    await heading(a, "Start here", firstA.body.data);
    await reference(a, b, 2);
    const firstB = await addLink(b, "https://fixture-links.dev/practice", 0).expect(201);
    await heading(b, "Practice", firstB.body.data);
    await reference(b, a, 2);
    // Legacy self references still render with bounded expansion; new saves do
    // not create them.
    await app.get(PrismaService).resource.create({
      data: { collectionId: a, kind: "collection_link", linkedCollectionId: a, position: 3 },
    });
    const md = (
      await exportAs({ format: "markdown", collectionIds: [a], expand: true }).expect(201)
    ).body.toString();
    expect(md).toContain("## Start here");
    expect(md).toContain("Context for this section.");
    expect(md).toContain("### Practice");
    expect(md.indexOf("## Start here")).toBeLessThan(md.indexOf(`## topic-order-${sfx}`));
    expect(md.match(/\]\(<https:\/\/fixture-links.dev\/practice>\)/g)).toHaveLength(1);
    expect(md.match(new RegExp(`/c/${a}`, "g"))).toHaveLength(2);
    expect(md).not.toContain("####");
    const docx = await exportAs({ format: "docx", collectionIds: [a], expand: true }).expect(201);
    const files = unzipSync(docx.body);
    const xml = new TextDecoder().decode(files["word/document.xml"]);
    expect(xml).toContain('w:val="Heading3"');
    expect(xml.indexOf("Start here")).toBeLessThan(xml.indexOf("Practice"));
    expect(xml.match(/Practice/g)).toHaveLength(1);
    const relationships = new TextDecoder().decode(files["word/_rels/document.xml.rels"]);
    expect(relationships).toContain(`/c/${a}`);
    const pdf = await exportAs({ format: "pdf", collectionIds: [a], expand: true }).expect(201);
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    // Keep disposable artifacts available for checking the rendered guide.
    await Bun.write("/tmp/independent-guide.pdf", pdf.body);
    await Bun.write("/tmp/independent-guide.docx", docx.body);
    await Bun.write("/tmp/independent-guide.md", md);
  });

  it("marks restricted references and omits references removed by confirmed deletion", async () => {
    const source = await createCollection(`public-reference-${sfx}`);
    const target = await createCollection(`private-secret-${sfx}`);
    await addLink(target, "https://fixture-links.dev/private-secret", 0).expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${source}/resources/collection`)
      .auth(bearer, { type: "bearer" })
      .send({ linkedCollectionId: target, position: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${source}/publish`)
      .auth(bearer, { type: "bearer" })
      .expect(201);
    for (const expand of [false, true]) {
      const md = (
        await exportAs({ format: "markdown", collectionIds: [source], expand }, otherBearer).expect(
          201,
        )
      ).body.toString();
      expect(md).toContain("Collection unavailable");
      expect(md).not.toContain("private-secret");
      expect(md).not.toContain(target);
    }
    const impact = await request(app.getHttpServer())
      .get(`/api/v1/collections/${target}/impact?action=delete`)
      .auth(bearer, { type: "bearer" })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/api/v1/collections/${target}`)
      .send({ impactToken: impact.body.data.token })
      .auth(bearer, { type: "bearer" })
      .expect(200);
    const deleted = (
      await exportAs({ format: "markdown", collectionIds: [source], expand: true }).expect(201)
    ).body.toString();
    expect(deleted).not.toContain("Collection unavailable");
    expect(deleted).not.toContain("private-secret");
  });

  it("rejects the whole request when any collection is unreadable", async () => {
    // 404, not 403: unreadable collections must not leak their existence.
    await exportAs({ format: "markdown", collectionIds: [guide] }, otherBearer).expect(404);
  });
});
