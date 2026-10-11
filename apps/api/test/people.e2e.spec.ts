import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInWithCode } from "./fixtures/sign-in";

describe("people and optional hubs", () => {
  let app: INestApplication, db: PrismaService;
  const api = () => request(app.getHttpServer());
  async function account(name = "A Person") {
    const email = `person-${randomUUID()}@example.com`;
    const result = await signInWithCode(app.getHttpServer(), { email, name });
    return {
      email,
      id: result.body.user.id as string,
      token: result.headers["set-auth-token"] as string,
      username: (await db.user.findUniqueOrThrow({ where: { email } })).username,
    };
  }
  async function collection(person: { token: string }, published = false) {
    return (
      await api()
        .post("/api/v1/collections")
        .auth(person.token, { type: "bearer" })
        .send({ title: "A useful collection", published })
        .expect(201)
    ).body.data;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
  });
  beforeEach(async () => {
    await db.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app.close();
  });

  it("keeps settings, public profiles and audit reads hubless and reserves app usernames", async () => {
    const person = await account();
    const before = await api()
      .get("/api/v1/profile")
      .auth(person.token, { type: "bearer" })
      .expect(200);
    expect(before.body.data.hubId).toBeNull();
    await api()
      .patch("/api/v1/profile")
      .auth(person.token, { type: "bearer" })
      .send({ displayName: "Profile name" })
      .expect(200);
    const publicView = await api().get(`/api/v1/people/by-username/${person.username}`).expect(200);
    expect(publicView.body.data).toEqual({
      person: { userId: person.id, username: person.username, name: "Profile name", bio: null },
      hub: null,
      collections: [],
    });
    expect(JSON.stringify(publicView.body)).not.toContain(person.email);
    expect(
      (
        await api()
          .get("/api/v1/manage/audit?action=collection.created")
          .auth(person.token, { type: "bearer" })
          .expect(200)
      ).body.data,
    ).toEqual([]);
    for (const username of [
      "home",
      "settings",
      "platform",
      "manage",
      "support",
      "invitations",
      "share",
      "s-hare",
      "sign-in",
      "signin",
    ]) {
      const response = await api()
        .patch("/api/v1/profile")
        .auth(person.token, { type: "bearer" })
        .send({ username })
        .expect(400);
      expect(response.body.error.code).toBe("username_reserved");
    }
    expect(await db.hub.count({ where: { ownerUserId: person.id } })).toBe(0);
  });
  it("persists a private account timezone, validates it and restores Automatic", async () => {
    const person = await account();
    const other = await account();
    const patch = (body: object, token = person.token) =>
      api().patch("/api/v1/profile").auth(token, { type: "bearer" }).send(body);
    expect((await db.user.findUniqueOrThrow({ where: { id: person.id } })).timeZone).toBeNull();
    await api().patch("/api/v1/profile").send({ timeZone: "UTC" }).expect(401);
    const saved = await patch({ timeZone: "Africa/Dar_es_Salaam" }).expect(200);
    expect(saved.body.data.timeZone).toBe("Africa/Dar_es_Salaam");
    expect((await db.user.findUniqueOrThrow({ where: { id: person.id } })).timeZone).toBe(
      "Africa/Dar_es_Salaam",
    );
    expect((await patch({ bio: "Reader" }).expect(200)).body.data.timeZone).toBe(
      "Africa/Dar_es_Salaam",
    );
    for (const timeZone of ["", "automatic", "Mars/Olympus", "+03:00", 3, {}, "x".repeat(101)])
      await patch({ timeZone }).expect(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: person.id } })).timeZone).toBe(
      "Africa/Dar_es_Salaam",
    );
    await patch({ id: person.id, timeZone: "UTC" }, other.token).expect(400);
    await patch({ timeZone: "UTC" }, other.token).expect(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: person.id } })).timeZone).toBe(
      "Africa/Dar_es_Salaam",
    );
    const publicView = await api().get(`/api/v1/people/by-username/${person.username}`).expect(200);
    expect(JSON.stringify(publicView.body)).not.toContain("timeZone");
    const alias = (await patch({ timeZone: "US/Eastern" }).expect(200)).body.data.timeZone;
    expect((await db.user.findUniqueOrThrow({ where: { id: person.id } })).timeZone).toBe(alias);
    expect(
      new Intl.DateTimeFormat("en-GB", { timeZone: alias, hour: "2-digit" }).format(
        new Date("2026-01-01T12:00:00Z"),
      ),
    ).toBe("07");
    expect((await patch({ timeZone: null }).expect(200)).body.data.timeZone).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: person.id } })).timeZone).toBeNull();
    expect(await db.hub.count({ where: { ownerUserId: person.id } })).toBe(0);
  });
  it("keeps public bios independent of hubs and validates, preserves and clears them", async () => {
    const person = await account();
    const patch = (body: object) =>
      api().patch("/api/v1/profile").auth(person.token, { type: "bearer" }).send(body);
    await api().patch("/api/v1/profile").send({ bio: "Not signed in" }).expect(401);
    const bio = "I collect useful ideas.\nAnd share what I learn.";
    const saved = await patch({ bio: `  ${bio}  ` }).expect(200);
    expect(saved.body.data.bio).toBe(bio);
    expect(saved.body.data.hubId).toBeNull();
    expect(await db.hub.count({ where: { ownerUserId: person.id } })).toBe(0);
    expect((await patch({ displayName: "A Reader" }).expect(200)).body.data.bio).toBe(bio);
    const path = `/api/v1/people/by-username/${person.username}`;
    const publicView = (await api().get(path).expect(200)).body.data;
    expect(publicView.person.bio).toBe(bio);
    expect(JSON.stringify(publicView)).not.toContain(person.email);
    for (const invalid of [null, 42, {}, "a".repeat(501)]) {
      await patch({ bio: invalid }).expect(400);
    }
    expect((await api().get(path).expect(200)).body.data.person.bio).toBe(bio);
    expect((await patch({ bio: "a".repeat(500) }).expect(200)).body.data.bio).toHaveLength(500);
    const owned = await collection(person);
    await patch({ hubDescription: "About this hub", showOwner: false }).expect(200);
    const updated = await patch({ bio }).expect(200);
    expect(updated.body.data.hubDescription).toBe("About this hub");
    expect(updated.body.data.hubId).toBe(owned.hubId);
    const hiddenHubView = (await api().get(path).expect(200)).body.data;
    expect(hiddenHubView.hub).toBeNull();
    expect(hiddenHubView.person.bio).toBe(bio);
    expect((await patch({ bio: "  \n " }).expect(200)).body.data.bio).toBeNull();
    expect((await api().get(path).expect(200)).body.data.person.bio).toBeNull();
  });
  it("allows one concurrent username claim without renaming either person's hub", async () => {
    const a = await account(),
      b = await account();
    const owned = await collection(a);
    const hub = await db.hub.findUniqueOrThrow({ where: { id: owned.hubId } });
    const username = `claim-${randomUUID().slice(0, 8)}`;
    const results = await Promise.all(
      [a, b].map((person) =>
        api().patch("/api/v1/profile").auth(person.token, { type: "bearer" }).send({ username }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.hub.findUniqueOrThrow({ where: { id: hub.id } })).handle).toBe(hub.handle);
    const winner = results[0].status === 200 ? a : b;
    await api().get(`/api/v1/people/by-username/${winner.username}`).expect(404);
    expect(
      (await api().get(`/api/v1/people/by-username/${username}`).expect(200)).body.data.person
        .userId,
    ).toBe(winner.id);
    const stable = await api().get(`/api/v1/people/${winner.id}`).expect(200);
    expect(stable.body.data.person.username).toBe(username);
    expect(JSON.stringify(stable.body)).not.toContain(winner.email);
    await db.user.update({ where: { id: winner.id }, data: { accountState: "inactive" } });
    await api().get(`/api/v1/people/${winner.id}`).expect(404);
    await api().get(`/api/v1/people/by-username/${username}`).expect(404);
    await api().get("/api/v1/people/not-an-id").expect(400);
  });
  it("normalizes case and treats hyphen variants as one username claim", async () => {
    const a = await account(),
      b = await account();
    const compact = `username${randomUUID().slice(0, 8)}`;
    const spelling = compact.replace("username", "user-name");
    const patch = (person: typeof a, username: unknown) =>
      api().patch("/api/v1/profile").auth(person.token, { type: "bearer" }).send({ username });
    const saved = await patch(a, spelling.toUpperCase()).expect(200);
    expect(saved.body.data.username).toBe(spelling);
    for (const variant of [
      compact,
      compact.toUpperCase(),
      spelling,
      compact.replace("user", "u-ser"),
    ]) {
      const availability = await api()
        .get("/api/v1/profile/username-availability")
        .auth(b.token, { type: "bearer" })
        .query({ username: variant })
        .expect(200);
      expect(availability.body.data.status).toBe("taken");
      expect((await patch(b, variant).expect(409)).body.error.code).toBe("username_unavailable");
    }
    // Neither raw persistence nor a concurrent claim can bypass the identity key.
    await expect(
      Promise.resolve(db.user.update({ where: { id: b.id }, data: { username: compact } })),
    ).rejects.toThrow();
    for (const invalid of [
      "user.name",
      "user_name",
      "user--name",
      "-username",
      "username-",
      "usérname",
      null,
      42,
    ])
      await patch(b, invalid).expect(400);
    for (const reserved of ["share", "s-hare", "signin"])
      await expect(
        Promise.resolve(db.user.update({ where: { id: b.id }, data: { username: reserved } })),
      ).rejects.toThrow();
    expect((await patch(a, compact).expect(200)).body.data.username).toBe(compact);
    const claim = `race${randomUUID().slice(0, 8)}`;
    const results = await Promise.all([patch(a, claim), patch(b, claim.replace("race", "ra-ce"))]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("offers checked shortening suggestions without changing or reserving usernames", async () => {
    const person = await account(),
      other = await account();
    const input = "somethingverylongwhatwillyoudoaboutthat";
    const availability = (username: string) =>
      api()
        .get("/api/v1/profile/username-availability")
        .auth(person.token, { type: "bearer" })
        .query({ username });
    const first = (await availability(input).expect(200)).body.data;
    expect(first.status).toBe("invalid");
    expect(first.suggestion).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{4}$/);
    expect(first.suggestion.length).toBeLessThanOrEqual(20);
    expect((await availability(input.toUpperCase()).expect(200)).body.data).toEqual(first);
    expect((await db.user.findUniqueOrThrow({ where: { id: person.id } })).username).toBe(
      person.username,
    );
    // Suggestions do not reserve names. Another person can claim the offered one.
    await api()
      .patch("/api/v1/profile")
      .auth(other.token, { type: "bearer" })
      .send({ username: first.suggestion.replaceAll("-", "") })
      .expect(200);
    const second = (await availability(input).expect(200)).body.data.suggestion;
    expect(second).not.toBe(first.suggestion);
    expect((await availability(second).expect(200)).body.data.status).toBe("available");
    await api()
      .patch("/api/v1/profile")
      .auth(person.token, { type: "bearer" })
      .send({ username: second })
      .expect(200);
    for (const invalid of [input, "a".repeat(21)]) {
      await api()
        .patch("/api/v1/profile")
        .auth(person.token, { type: "bearer" })
        .send({ username: invalid })
        .expect(400);
      await expect(
        Promise.resolve(db.user.update({ where: { id: person.id }, data: { username: invalid } })),
      ).rejects.toThrow();
    }
    for (const invalid of ["bad.name.with.punctuation", "bad--name-that-is-too-long"])
      expect((await availability(invalid).expect(200)).body.data.suggestion).toBeUndefined();
    const boundary = `name${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const saved = await api()
      .patch("/api/v1/profile")
      .auth(person.token, { type: "bearer" })
      .send({ username: boundary.toUpperCase() })
      .expect(200);
    expect(saved.body.data.username).toBe(boundary);
    const onboarded = await account("Something Very Long For A New Account");
    expect(onboarded.username.length).toBeLessThanOrEqual(20);
  });
  it("creates exactly one hub for concurrent first collections and leaves failed first saves hubless", async () => {
    const person = await account();
    const [a, b] = await Promise.all([collection(person), collection(person)]);
    expect(a.hubId).toBe(b.hubId);
    expect(await db.hub.count({ where: { ownerUserId: person.id } })).toBe(1);
    const fresh = await account();
    await api()
      .post("/api/v1/capture")
      .auth(fresh.token, { type: "bearer" })
      .send({
        links: [{ url: "https://fixture-links.dev/missing-target" }],
        destination: randomUUID(),
        operationId: randomUUID(),
        startedAt: Date.now(),
      })
      .expect(404);
    expect(await db.hub.count({ where: { ownerUserId: fresh.id } })).toBe(0);
    const body = {
      links: [{ url: "https://fixture-links.dev/first" }],
      destination: "first",
      operationId: randomUUID(),
      startedAt: Date.now(),
    };
    const saves = await Promise.all(
      [0, 1].map(() =>
        api().post("/api/v1/capture").auth(fresh.token, { type: "bearer" }).send(body).expect(201),
      ),
    );
    expect(saves[0].body.data.collectionId).toBe(saves[1].body.data.collectionId);
    expect(await db.hub.count({ where: { ownerUserId: fresh.id } })).toBe(1);
  });
  it("paginates contributions through microseconds and identical timestamp boundaries", async () => {
    const person = await account();
    const hub = (
      await api().post("/api/v1/hubs").auth(person.token, { type: "bearer" }).send({}).expect(201)
    ).body.data.hubId;
    const rows: Array<{ id: string; at: string }> = [];
    for (const fraction of ["123900", "123800", "123800", "123100", "122900"]) {
      const at = `2026-10-09T12:00:00.${fraction}Z`;
      // INSERT preserves exact fixture timestamps without disabling update triggers.
      const [row] = await db.$queryRaw<Array<{ id: string }>>`
        INSERT INTO collections (hub_id, title, published, creator_user_id, updated_at)
        VALUES (${hub}::uuid, 'Precision', true,
          ${person.id}::uuid, ${at}::timestamptz) RETURNING id`;
      rows.push({ id: row.id, at });
      await db.auditLog.create({
        data: {
          actorUserId: person.id,
          hubId: hub,
          collectionId: row.id,
          action: "collection.created",
          category: "content",
        },
      });
    }
    rows.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
    const path = `/api/v1/people/${person.id}`;
    for (const limit of [1, 2]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const response = await api()
          .get(path)
          .query({ limit, ...(cursor ? { cursor } : {}) })
          .expect(200);
        const page: Array<{ id: string }> = response.body.data.collections;
        seen.push(...page.map((row) => row.id));
        cursor = response.body.meta.nextCursor;
        expect(seen.length).toBeLessThanOrEqual(rows.length);
        if (cursor) {
          const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString());
          expect(decoded.u).toBe(rows.find((row) => row.id === page.at(-1)?.id)?.at);
        }
      } while (cursor);
      expect(seen).toEqual(rows.map((row) => row.id));
    }
    const first = await api().get(path).query({ limit: 1 }).expect(200);
    const other = await account();
    await api()
      .get(`/api/v1/people/${other.id}`)
      .query({ cursor: first.body.meta.nextCursor })
      .expect(400);
    await api().get(path).query({ cursor: "invalid" }).expect(400);
    for (const u of ["2026-02-31T12:00:00.123456Z", "not-a-date", "2026-10-09"]) {
      const cursor = Buffer.from(JSON.stringify({ person: person.id, id: rows[0].id, u })).toString(
        "base64url",
      );
      const rejected = await api().get(path).query({ cursor }).expect(400);
      expect(rejected.body.error.code).toBe("invalid_cursor");
    }
  });

  it("credits hubless collaborators, exposes only available public contributions and creates a hub on transfer", async () => {
    const owner = await account(),
      contributor = await account();
    const visible = await collection(owner, true),
      hidden = await collection(owner),
      second = await collection(owner, true);
    for (const item of [visible, hidden, second]) {
      await api()
        .post(`/api/v1/collections/${item.id}/shares`)
        .auth(owner.token, { type: "bearer" })
        .send({ email: contributor.email, role: "contributor" })
        .expect(201);
      const resource = await api()
        .post(`/api/v1/collections/${item.id}/resources/external`)
        .auth(contributor.token, { type: "bearer" })
        .send({ url: "https://fixture-links.dev/contribution", position: 0 })
        .expect(201);
      expect(resource.body.data.addedBy).toEqual({
        userId: contributor.id,
        username: contributor.username,
      });
    }
    const comment = await api()
      .post(`/api/v1/collections/${visible.id}/comments`)
      .auth(contributor.token, { type: "bearer" })
      .send({ body: "A useful addition" })
      .expect(201);
    expect(comment.body.data.author.username).toBe(contributor.username);
    await api()
      .post(`/api/v1/collections/${visible.id}/save`)
      .auth(contributor.token, { type: "bearer" })
      .expect(201);
    expect(await db.hub.count({ where: { ownerUserId: contributor.id } })).toBe(0);
    const path = `/api/v1/people/by-username/${contributor.username}`;
    const first = await api().get(`${path}?limit=1`).expect(200);
    expect(first.body.data.collections).toHaveLength(1);
    expect(first.body.data.hub).toBeNull();
    const next = await api()
      .get(path)
      .query({ cursor: first.body.meta.nextCursor, limit: 1 })
      .expect(200);
    expect(
      new Set(
        [...first.body.data.collections, ...next.body.data.collections].map(
          (c: { id: string }) => c.id,
        ),
      ),
    ).toEqual(new Set([visible.id, second.id]));
    await api()
      .post(`/api/v1/collections/${visible.id}/unpublish`)
      .auth(owner.token, { type: "bearer" })
      .expect(201);
    expect(
      (await api().get(path).expect(200)).body.data.collections.map((c: { id: string }) => c.id),
    ).toEqual([second.id]);
    await db.collectionHold.create({
      data: { collectionId: second.id, active: true, reason: "spam", actorUserId: owner.id },
    });
    expect((await api().get(path).expect(200)).body.data.collections).toEqual([]);
    await db.collectionHold.update({ where: { collectionId: second.id }, data: { active: false } });
    await db.user.update({ where: { id: owner.id }, data: { accountState: "suspended" } });
    expect((await api().get(path).expect(200)).body.data.collections).toEqual([]);
    await db.user.update({ where: { id: owner.id }, data: { accountState: "active" } });
    await api()
      .post(`/api/v1/collections/${hidden.id}/transfer`)
      .auth(owner.token, { type: "bearer" })
      .send({ email: contributor.email })
      .expect(201);
    const hub = await db.hub.findUniqueOrThrow({ where: { ownerUserId: contributor.id } });
    expect((await db.collection.findUniqueOrThrow({ where: { id: hidden.id } })).hubId).toBe(
      hub.id,
    );
    await db.user.update({ where: { id: contributor.id }, data: { accountState: "suspended" } });
    await api().get(path).expect(404);
  });
  it("creates only the caller's optional hub and keeps concurrent retries idempotent", async () => {
    const person = await account();
    const other = await account();
    await api().post("/api/v1/hubs").send({}).expect(401);
    const results = await Promise.all(
      [0, 1].map(() =>
        api().post("/api/v1/hubs").auth(person.token, { type: "bearer" }).send({}).expect(201),
      ),
    );
    expect(results[0].body.data.hubId).toBe(results[1].body.data.hubId);
    expect(await db.hub.count({ where: { ownerUserId: person.id } })).toBe(1);
    expect(await db.hub.count({ where: { ownerUserId: other.id } })).toBe(0);
    expect(await db.collection.count({ where: { hubId: results[0].body.data.hubId } })).toBe(0);
    const created = await collection(person);
    expect(created.hubId).toBe(results[0].body.data.hubId);
  });
});
