import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("canonical sharing descriptors (HTTP)", () => {
  let app: INestApplication, db: PrismaService;
  let owner: { id: string; email: string; token: string; cookie: string },
    reader: typeof owner,
    operator: typeof owner,
    admin: typeof owner;
  let publicId: string, privateId: string, hubId: string;
  const api = () => request(app.getHttpServer());
  const endpoint = (kind: string, id?: string) =>
    `/api/v1/share/resolve?${new URLSearchParams({ kind, ...(id ? { id } : {}) })}`;
  const origin = () => new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  async function account() {
    const email = `share-${randomUUID()}@example.com`;
    const signed = await signInWithCode(app.getHttpServer(), { email, name: "A sharer" });
    return {
      id: signed.body.user.id as string,
      email,
      token: signed.headers["set-auth-token"] as string,
      cookie: (signed.headers["set-cookie"] as unknown as string[])
        .map((value) => value.split(";")[0])
        .join("; "),
    };
  }
  async function enable(rotate = false) {
    return (
      await api()
        .put(`/api/v1/collections/${privateId}/link-sharing`)
        .auth(owner.token, { type: "bearer" })
        .send({ enabled: true, rotate })
        .expect(200)
    ).body.data.token as string;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    owner = await account();
    reader = await account();
    operator = await account();
    admin = await account();
    await db.adminGrant.create({ data: { userId: admin.id, invitationId: randomUUID() } });
    await db.operatorGrant.create({ data: { userId: operator.id, authority: "test" } });
    for (const published of [true, false]) {
      const c = (
        await api()
          .post("/api/v1/collections")
          .auth(owner.token, { type: "bearer" })
          .send({
            title: published ? "Public guide" : "Private guide",
            slug: `share-${randomUUID()}`,
            published,
          })
          .expect(201)
      ).body.data;
      hubId = c.hubId;
      if (published) publicId = c.id;
      else privateId = c.id;
    }
  });
  beforeEach(async () => {
    await db.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  it("validates kinds, IDs and token shape without accepting client URLs or labels", async () => {
    for (const path of [
      "/api/v1/share/resolve",
      endpoint("unknown"),
      endpoint("profile"),
      endpoint("hub", "bad"),
      `${endpoint("site")}&url=https://outside.invalid`,
      `${endpoint("site")}&name=Forged`,
      `${endpoint("site")}&returnTo=/manage`,
      `${endpoint("collection", privateId)}&s=a&s=b`,
    ])
      await api().get(path).expect(400);
    await api()
      .get(endpoint("collection", privateId))
      .set("x-share-token", "a".repeat(513))
      .expect(400);
    for (const kind of ["profile", "hub", "collection"])
      expect((await api().get(endpoint(kind, randomUUID())).expect(404)).body.error.code).toBe(
        "not_found",
      );
  });

  it("returns minimal stable descriptors using configured origin, never host headers", async () => {
    const cases = [
      { kind: "site", path: "/", name: "linkhub", id: null },
      { kind: "profile", path: `/people/${owner.id}`, name: "A sharer", id: owner.id },
      {
        kind: "hub",
        path: `/h/${hubId}`,
        name: (await db.hub.findUniqueOrThrow({ where: { id: hubId } })).name,
        id: hubId,
      },
      { kind: "collection", path: `/c/${publicId}`, name: "Public guide", id: publicId },
    ];
    for (const item of cases) {
      const response = await api()
        .get(endpoint(item.kind, item.id ?? undefined))
        .set("Host", "outside.invalid")
        .set("X-Forwarded-Host", "outside.invalid")
        .expect(200);
      expect(response.body.data).toEqual({
        ...item,
        message: `Share ${item.kind}`,
        url: `${origin()}${item.path}`,
        access: "public",
        capabilities: { canManageAccess: false },
      });
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.headers.vary).toContain("X-Share-Token");
      expect(JSON.stringify(response.body)).not.toContain(owner.email);
    }
    await api()
      .patch("/api/v1/profile")
      .auth(owner.token, { type: "bearer" })
      .send({
        username: `renamed-${randomUUID().slice(0, 8)}`,
        handle: `renamed-${randomUUID()}`,
        displayName: "Renamed person",
        hubName: "Renamed hub",
      })
      .expect(200);
    for (const [kind, id, path, name] of [
      ["profile", owner.id, `/people/${owner.id}`, "Renamed person"],
      ["hub", hubId, `/h/${hubId}`, "Renamed hub"],
    ]) {
      const data = (await api().get(endpoint(kind, id)).expect(200)).body.data;
      expect(data.path).toBe(path);
      expect(data.name).toBe(name);
    }
  });

  it("creates a complete entry immediately, supports custom text and destination, and scopes history", async () => {
    const message = "  A useful guide for our team.\n<script>plain text</script>  ";
    const post = (body: object) =>
      api().post("/api/v1/share").auth(owner.token, { type: "bearer" }).send(body);
    await api().post("/api/v1/share").send({ kind: "site" }).expect(401);
    const response = await post({
      kind: "collection",
      id: publicId,
      message,
      context: {
        destination: "  WhatsApp  ",
        campaign: "reading-week",
        extra: { tags: ["guide"] },
      },
    }).expect(201);
    const data = response.body.data;
    expect(data.id).not.toBe(publicId);
    expect(data.resourceId).toBe(publicId);
    expect(data.message).toBe(message.trim());
    expect(data.context).toEqual({
      destination: "WhatsApp",
      campaign: "reading-week",
      extra: { tags: ["guide"] },
    });
    expect(data.createdByUserId).toBe(owner.id);
    expect(data.openCount).toBe(0);
    expect(data.createdAt).toBeString();
    expect(response.headers.location).toBe(`/api/v1/share/${data.id}`);
    expect(data.resource.url).toBe(`${origin()}/c/${publicId}?via=${data.id}`);
    expect(data.resource.url).not.toContain("message");
    expect(
      (await api().get(response.headers.location).auth(owner.token, { type: "bearer" }).expect(200))
        .body.data,
    ).toEqual(data);
    await api().get(response.headers.location).auth(reader.token, { type: "bearer" }).expect(404);
    await api().get(response.headers.location).expect(401);
    const blank = (
      await post({
        kind: "profile",
        id: owner.id,
        message: "   ",
        context: { destination: "   " },
      }).expect(201)
    ).body.data;
    expect(blank.message).toBe("Share profile");
    expect(blank.context).toEqual({});
    expect(
      (await post({ kind: "site", message: "a".repeat(1000) }).expect(201)).body.data.message,
    ).toHaveLength(1000);
    for (const message of ["a".repeat(1001), ["a", "b"], 42, {}])
      await post({ kind: "site", message }).expect(400);
    for (const destination of ["a".repeat(101), ["a"], 42, {}])
      await post({ kind: "site", context: { destination } }).expect(400);
    for (const body of [
      { kind: "unknown" },
      { kind: "profile" },
      { kind: "hub", id: "bad" },
      { kind: "site", url: "https://outside.invalid" },
    ])
      await post(body).expect(400);
    await api().get(endpoint("site")).query({ message: "Custom" }).expect(400);
    await api()
      .post("/api/v1/share")
      .auth(reader.token, { type: "bearer" })
      .send({ kind: "collection", id: privateId })
      .expect(404);
    const before = await db.collection.findUniqueOrThrow({ where: { id: privateId } });
    const audits = await db.auditLog.count();
    const result = await post({ kind: "collection", id: privateId, message: "Custom" }).expect(201);
    expect(result.body.data.resource.capabilities.canManageAccess).toBe(true);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(await db.collection.findUniqueOrThrow({ where: { id: privateId } })).toEqual(before);
    expect(await db.auditLog.count()).toBe(audits);
    const body = { kind: "collection", id: privateId, message: "From a browser" };
    await api().post("/api/v1/share").set("Cookie", owner.cookie).send(body).expect(403);
    await api()
      .post("/api/v1/share")
      .set("Cookie", owner.cookie)
      .set("Origin", new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:4000").origin)
      .send(body)
      .expect(201);
    for (const query of [
      { q: data.id },
      { id: data.id },
      { q: "USEFUL GUIDE" },
      { destination: "whatsAPP", message: "team" },
    ]) {
      const listed = (
        await api()
          .get("/api/v1/share")
          .query(query)
          .auth(owner.token, { type: "bearer" })
          .expect(200)
      ).body;
      expect(listed.data.map((entry: { id: string }) => entry.id)).toEqual([data.id]);
      expect(listed.meta.nextCursor).toBeNull();
    }
    expect(
      (
        await api()
          .get("/api/v1/share")
          .query({ q: data.id })
          .auth(reader.token, { type: "bearer" })
          .expect(200)
      ).body.data,
    ).toEqual([]);
  });

  it("records usable optional metadata, warns without losing opens, and deduplicates only event IDs", async () => {
    const entry = (
      await api()
        .post("/api/v1/share")
        .auth(owner.token, { type: "bearer" })
        .send({ kind: "site", context: { campaign: "test", nested: { tags: ["one"] } } })
        .expect(201)
    ).body.data;
    const path = `/api/v1/share/${entry.id}/opens`;
    const event = {
      kind: "site",
      eventId: randomUUID(),
      occurredAt: "2026-01-01T20:00:00+03:00",
      attribution: {
        utm_source: " newsletter ",
        utm_medium: "email",
        utm_campaign: "reading",
        utm_id: "42",
        utm_term: "books",
        utm_content: "footer",
      },
      context: { timezone: "Africa/Dar_es_Salaam", extra: { tags: ["evening"], enabled: true } },
    };
    const first = await api().post(path).send(event).expect(201);
    expect(first.body).toEqual({ data: { recorded: true, created: true }, warnings: [] });
    const stored = await db.shareOpen.findFirstOrThrow({ where: { shareId: entry.id } });
    expect(stored.occurredAt?.toISOString()).toBe("2026-01-01T17:00:00.000Z");
    expect(stored.createdAt.getTime()).toBeGreaterThan(stored.occurredAt?.getTime() ?? 0);
    expect(stored.attribution).toEqual({ ...event.attribution, utm_source: "newsletter" });
    expect(stored.context).toEqual(event.context);
    expect(stored.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    const duplicate = await api()
      .post(path)
      .send({ ...event, context: { changed: true } })
      .expect(200);
    expect(duplicate.body.data.created).toBe(false);
    expect(await db.shareOpen.findUnique({ where: { id: stored.id } })).toEqual(stored);
    await api()
      .post(path)
      .send({ ...event, eventId: randomUUID(), occurredAt: "2026-01-02T20:00:00Z" })
      .expect(201);
    expect(
      await db.shareOpen.count({ where: { shareId: entry.id, payloadHash: stored.payloadHash } }),
    ).toBe(2);
    const concurrent = {
      kind: "site",
      eventId: randomUUID(),
      context: null,
      attribution: null,
      occurredAt: null,
    };
    const responses = await Promise.all([
      api().post(path).send(concurrent),
      api().post(path).send(concurrent),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(responses.every((r) => r.body.warnings.length === 0)).toBe(true);
    const partial = await api()
      .post(path)
      .send({
        kind: "site",
        eventId: randomUUID(),
        occurredAt: "yesterday",
        attribution: { utm_source: "whatsapp", utm_medium: 42, arbitrary: "not reflected" },
        context: ["bad"],
      })
      .expect(201);
    expect(partial.body.warnings.map((w: { field: string }) => w.field)).toEqual([
      "attribution",
      "attribution.utm_medium",
      "context",
      "occurredAt",
    ]);
    expect(JSON.stringify(partial.body)).not.toContain("not reflected");
    const partialRow = await db.shareOpen.findFirstOrThrow({
      where: { shareId: entry.id },
      orderBy: { id: "desc" },
    });
    expect(partialRow.attribution).toEqual({ utm_source: "whatsapp" });
    expect(partialRow.context).toBeNull();
    expect(partialRow.occurredAt).toBeNull();
    for (const metadata of [
      { attribution: "wrong", context: { oversized: "x".repeat(8193) } },
      { attribution: { utm_source: "\ud800" }, context: { invalidUnicode: "\ud800" } },
      {
        attribution: { utm_content: "x".repeat(257) },
        context: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } },
      },
      {
        attribution: { utm_source: "bad\u0000value" },
        context: { value: "bad\u0000value" },
        occurredAt: "2026-02-30T00:00:00Z",
      },
    ]) {
      const result = await api()
        .post(path)
        .send({ kind: "site", eventId: randomUUID(), ...metadata })
        .expect(201);
      expect(result.body.warnings.length).toBeGreaterThan(0);
    }
    expect(await db.shareOpen.count({ where: { shareId: entry.id } })).toBe(8);
    expect((await db.shareEntry.findUniqueOrThrow({ where: { id: entry.id } })).openCount).toBe(8);
    for (const eventId of [undefined, "bad", 42])
      await api().post(path).send({ kind: "site", eventId }).expect(400);
    expect(await db.shareOpen.count({ where: { shareId: entry.id } })).toBe(8);
    expect((await db.shareEntry.findUniqueOrThrow({ where: { id: entry.id } })).context).toEqual(
      entry.context,
    );
  });

  it("paginates with scoped cursors and literal substring filters, and makes create retries idempotent", async () => {
    const body = {
      kind: "site",
      message: "100% useful_under\\score",
      context: { a: 1, b: { c: 2 } },
      operationId: randomUUID(),
    };
    const post = (input: object) =>
      api().post("/api/v1/share").auth(owner.token, { type: "bearer" }).send(input);
    const a = (await post(body).expect(201)).body.data;
    const b = (await post({ ...body, context: { b: { c: 2 }, a: 1 } }).expect(201)).body.data;
    expect(a).toEqual(b);
    await post({ ...body, message: "Different" }).expect(409);
    for (const q of ["%", "_", "\\"]) {
      const result = (
        await api()
          .get("/api/v1/share")
          .query({ q })
          .auth(owner.token, { type: "bearer" })
          .expect(200)
      ).body.data;
      expect(result.map((entry: { id: string }) => entry.id)).toEqual([a.id]);
    }
    const first = (
      await api().get("/api/v1/share?limit=1").auth(owner.token, { type: "bearer" }).expect(200)
    ).body;
    expect(first.meta.nextCursor).toBeString();
    const second = (
      await api()
        .get("/api/v1/share")
        .query({ limit: 1, cursor: first.meta.nextCursor })
        .auth(owner.token, { type: "bearer" })
        .expect(200)
    ).body;
    expect(first.data[0].id).not.toBe(second.data[0].id);
    for (const [token, query] of [
      [reader.token, { cursor: first.meta.nextCursor }],
      [owner.token, { cursor: first.meta.nextCursor, q: "changed" }],
      [owner.token, { cursor: "bad" }],
      [owner.token, { limit: 101 }],
    ] as const)
      await api().get("/api/v1/share").query(query).auth(token, { type: "bearer" }).expect(400);
  });

  it("counts reported opens once per event and separates personal, resource-owner and admin analytics", async () => {
    const create = (actor: typeof owner, kind: string, id?: string) =>
      api()
        .post("/api/v1/share")
        .auth(actor.token, { type: "bearer" })
        .send({
          kind,
          ...(id ? { id } : {}),
          context: { destination: "email", privateNote: "Personal context" },
          message: "Private authored note",
        });
    const entry = (await create(reader, "collection", publicId).expect(201)).body.data;
    const event = { kind: "collection", id: publicId, eventId: randomUUID() };
    const open = () => api().post(`/api/v1/share/${entry.id}/opens`).send(event);
    await open().expect(201);
    await open().expect(200);
    expect((await db.shareEntry.findUniqueOrThrow({ where: { id: entry.id } })).openCount).toBe(1);
    expect(await db.shareOpen.count({ where: { shareId: entry.id } })).toBe(1);
    await api()
      .post(`/api/v1/share/${entry.id}/opens`)
      .send({ ...event, id: privateId })
      .expect(404);
    await api()
      .post(`/api/v1/share/${entry.id}/opens`)
      .send({ ...event, eventId: "bad" })
      .expect(400);
    await api().post(`/api/v1/share/${randomUUID()}/opens`).send(event).expect(404);
    const personal = (
      await api().get("/api/v1/share/analytics").auth(reader.token, { type: "bearer" }).expect(200)
    ).body.data;
    expect(personal.total).toBe(1);
    expect(personal.opens).toBe(1);
    expect(personal.byDestination).toEqual([{ destination: "email", count: 1, opens: 1 }]);
    const resourceQuery = { scope: "resource", kind: "collection", resourceId: publicId };
    const resource = (
      await api()
        .get("/api/v1/share/analytics")
        .query(resourceQuery)
        .auth(owner.token, { type: "bearer" })
        .expect(200)
    ).body.data;
    expect(resource.total).toBe(2);
    expect(resource.opens).toBe(1);
    expect(JSON.stringify(resource)).not.toContain(reader.id);
    expect(JSON.stringify(resource)).not.toContain("Private authored note");
    await api()
      .get("/api/v1/share/analytics")
      .query(resourceQuery)
      .auth(reader.token, { type: "bearer" })
      .expect(404);
    await api()
      .get("/api/v1/share/analytics?scope=resource&kind=site")
      .auth(owner.token, { type: "bearer" })
      .expect(400);
    await api()
      .get("/api/v1/share/analytics?from=2026-01-02&to=2026-01-01")
      .auth(owner.token, { type: "bearer" })
      .expect(400);
    await api()
      .get("/api/v1/share/analytics?from=bad")
      .auth(owner.token, { type: "bearer" })
      .expect(400);
    for (const path of [
      "/api/v1/share?scope=service",
      "/api/v1/share/analytics?scope=service",
      `/api/v1/share/${entry.id}?scope=service`,
    ]) {
      await api().get(path).auth(admin.token, { type: "bearer" }).expect(403);
      await api()
        .get(path)
        .set("Cookie", operator.cookie)
        .expect(path.includes("/analytics?") ? 200 : 403);
      await api().get(path).set("Cookie", owner.cookie).expect(403);
      await api().get(path).expect(401);
      const service = (await api().get(path).set("Cookie", admin.cookie).expect(200)).body.data;
      expect(JSON.stringify(service)).not.toContain("Private authored note");
      expect(JSON.stringify(service)).not.toContain("Personal context");
    }
    const metadata = (
      await api()
        .get(`/api/v1/share/${entry.id}?scope=service`)
        .set("Cookie", admin.cookie)
        .expect(200)
    ).body.data;
    expect(metadata.resource).toBeNull();
    expect(metadata.message).toBeNull();
    expect(metadata.context).toBeNull();
    await api()
      .get("/api/v1/share?scope=service&message=secret")
      .set("Cookie", admin.cookie)
      .expect(400);
    expect(
      (
        await api()
          .get("/api/v1/share?scope=service&q=Private%20authored%20note")
          .set("Cookie", admin.cookie)
          .expect(200)
      ).body.data,
    ).toEqual([]);
    expect(
      await db.auditLog.count({ where: { action: "sharing.analytics", actorUserId: admin.id } }),
    ).toBeGreaterThan(0);
    await db.adminGrant.delete({ where: { userId: admin.id } });
    await api().get("/api/v1/share?scope=service").set("Cookie", admin.cookie).expect(403);
    await api()
      .get("/api/v1/share/analytics?scope=service")
      .set("Cookie", admin.cookie)
      .expect(403);
    await api()
      .get("/api/v1/share/analytics?scope=service")
      .auth(operator.token, { type: "bearer" })
      .expect(403);
    expect(
      await db.auditLog.count({ where: { action: "sharing.analytics", actorUserId: operator.id } }),
    ).toBeGreaterThan(0);
    await db.operatorGrant.delete({ where: { userId: operator.id } });
    await api()
      .get("/api/v1/share/analytics?scope=service")
      .set("Cookie", operator.cookie)
      .expect(403);
    await db.operatorGrant.create({ data: { userId: operator.id, authority: "test" } });
  });

  it("never stores a private bearer token or lets tracking IDs bypass token rotation", async () => {
    const token = await enable();
    const entry = (
      await api()
        .post("/api/v1/share")
        .auth(reader.token, { type: "bearer" })
        .set("x-share-token", token)
        .send({ kind: "collection", id: privateId })
        .expect(201)
    ).body.data;
    const stored = await db.shareEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(JSON.stringify(stored)).not.toContain(token);
    const url = new URL(entry.resource.url);
    expect(url.searchParams.get("s")).toBe(token);
    expect(url.searchParams.get("via")).toBe(entry.id);
    const body = { kind: "collection", id: privateId, eventId: randomUUID() };
    await api().post(`/api/v1/share/${entry.id}/opens`).send(body).expect(404);
    await api()
      .post(`/api/v1/share/${entry.id}/opens`)
      .set("x-share-token", token)
      .send(body)
      .expect(201);
    await enable(true);
    await api()
      .post(`/api/v1/share/${entry.id}/opens`)
      .set("x-share-token", token)
      .send({ ...body, eventId: randomUUID() })
      .expect(404);
    const refreshed = (
      await api()
        .get(`/api/v1/share/${entry.id}`)
        .auth(reader.token, { type: "bearer" })
        .set("x-share-token", token)
        .expect(200)
    ).body.data;
    expect(refreshed.resource).toBeNull();
    expect(refreshed.openCount).toBe(1);
    expect(
      await db.collectionShare.count({ where: { collectionId: privateId, userId: reader.id } }),
    ).toBe(0);
  });

  it("enforces direct and owner access without a service-operator bypass", async () => {
    await api().get(endpoint("collection", privateId)).expect(404);
    await api()
      .get(endpoint("collection", privateId))
      .auth(operator.token, { type: "bearer" })
      .expect(404);
    const owned = (
      await api()
        .get(endpoint("collection", privateId))
        .auth(owner.token, { type: "bearer" })
        .expect(200)
    ).body.data;
    expect(owned.access).toBe("restricted");
    expect(owned.capabilities.canManageAccess).toBe(true);
    expect(owned.url).toBe(`${origin()}/c/${privateId}`);
    await api()
      .post(`/api/v1/collections/${privateId}/shares`)
      .auth(owner.token, { type: "bearer" })
      .send({ email: reader.email, role: "contributor" })
      .expect(201);
    const direct = (
      await api()
        .get(endpoint("collection", privateId))
        .auth(reader.token, { type: "bearer" })
        .expect(200)
    ).body.data;
    expect(direct.access).toBe("restricted");
    expect(direct.capabilities.canManageAccess).toBe(false);
    await api()
      .delete(`/api/v1/collections/${privateId}/shares/${reader.id}`)
      .auth(owner.token, { type: "bearer" })
      .expect(200);
  });

  it("returns only valid explicit private tokens, strips public tokens, and writes no grants", async () => {
    const token = await enable(true);
    const before = await db.collection.findUniqueOrThrow({ where: { id: privateId } });
    const grants = await db.collectionShare.count({ where: { collectionId: privateId } });
    const audits = await db.auditLog.count();
    const link = (
      await api()
        .get(endpoint("collection", privateId))
        .set("x-share-token", token)
        .auth(reader.token, { type: "bearer" })
        .expect(200)
    ).body.data;
    expect(link.access).toBe("link");
    expect(link.url).toBe(`${origin()}/c/${privateId}?s=${encodeURIComponent(token)}`);
    expect(link.capabilities.canManageAccess).toBe(false);
    expect(await db.collectionShare.count({ where: { collectionId: privateId } })).toBe(grants);
    expect(await db.auditLog.count()).toBe(audits);
    expect(await db.collection.findUniqueOrThrow({ where: { id: privateId } })).toEqual(before);
    await api()
      .get(`${endpoint("collection", privateId)}&s=${encodeURIComponent(token)}`)
      .expect(200);
    await api()
      .get(`${endpoint("collection", privateId)}&s=${encodeURIComponent(token)}`)
      .set("x-share-token", "invalid")
      .expect(404);
    for (const [kind, id] of [
      ["site", undefined],
      ["profile", owner.id],
      ["hub", hubId],
      ["collection", publicId],
    ]) {
      const data = (
        await api()
          .get(endpoint(kind as string, id))
          .set("x-share-token", token)
          .expect(200)
      ).body.data;
      expect(data.url).not.toContain(token);
      expect(data.access).toBe("public");
    }
    const replacement = await enable(true);
    await api().get(endpoint("collection", privateId)).set("x-share-token", token).expect(404);
    const stale = (
      await api()
        .get(endpoint("collection", privateId))
        .auth(owner.token, { type: "bearer" })
        .set("x-share-token", token)
        .expect(200)
    ).body.data;
    expect(stale.access).toBe("restricted");
    expect(stale.url).not.toContain(token);
    const current = (
      await api()
        .get(endpoint("collection", privateId))
        .auth(owner.token, { type: "bearer" })
        .set("x-share-token", replacement)
        .expect(200)
    ).body.data;
    expect(current.access).toBe("link");
    await api()
      .put(`/api/v1/collections/${privateId}/link-sharing`)
      .auth(owner.token, { type: "bearer" })
      .send({ enabled: false })
      .expect(200);
    await api()
      .get(endpoint("collection", privateId))
      .set("x-share-token", replacement)
      .expect(404);
  });

  it("hides held collections and inactive identities and does not imply a held link is public", async () => {
    await db.collectionHold.create({
      data: { collectionId: publicId, actorUserId: operator.id, reason: "spam" },
    });
    await api().get(endpoint("collection", publicId)).expect(404);
    await api()
      .get(endpoint("collection", publicId))
      .auth(operator.token, { type: "bearer" })
      .expect(404);
    const held = (
      await api()
        .get(endpoint("collection", publicId))
        .auth(owner.token, { type: "bearer" })
        .expect(200)
    ).body.data;
    expect(held.access).toBe("restricted");
    expect(held.capabilities.canManageAccess).toBe(true);
    await db.user.update({ where: { id: owner.id }, data: { accountState: "inactive" } });
    for (const [kind, id] of [
      ["profile", owner.id],
      ["hub", hubId],
      ["collection", privateId],
    ])
      await api().get(endpoint(kind, id)).expect(404);
  });
});
