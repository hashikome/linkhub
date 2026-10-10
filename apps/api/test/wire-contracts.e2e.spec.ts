import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { Controller, Get, HttpException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type {
  AuditLogEntry,
  Collection,
  CollectionShareView,
  CursorMeta,
  Profile,
  Readiness,
  Resource,
  SavedCollection,
  SharedCollection,
} from "@nslinkhub/types";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { HealthService } from "../src/modules/health/health.service";
import { signInHubOwner } from "./fixtures/sign-in";

type Shape<T> = { [K in keyof Required<T>]: (value: unknown) => boolean };
const string = (v: unknown) => typeof v === "string";
const nullableString = (v: unknown) => v === null || string(v);
const bool = (v: unknown) => typeof v === "boolean";
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const iso = (v: unknown) =>
  typeof v === "string" && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
const strings = (v: unknown) => Array.isArray(v) && v.every(string);
const role = (v: unknown) => v === "viewer" || v === "contributor";
const source = (v: unknown) => v === "direct" || v === "link";
const collectionShape = {
  hub: (v: unknown) =>
    v === undefined ||
    (typeof v === "object" &&
      v !== null &&
      "id" in v &&
      uuid(v.id) &&
      "handle" in v &&
      string(v.handle)),
  capabilities: (v: unknown) =>
    v === undefined ||
    (typeof v === "object" && v !== null && "canManage" in v && bool(v.canManage)),
  restriction: (v: unknown) =>
    v === undefined || (typeof v === "object" && v !== null && "reason" in v && "supportUrl" in v),
  creator: (v: unknown) =>
    v === undefined ||
    v === null ||
    (typeof v === "object" && "userId" in v && "username" in v && !("name" in v)),
  contributors: (v: unknown) =>
    v === undefined ||
    (typeof v === "object" &&
      v !== null &&
      "people" in v &&
      Array.isArray(v.people) &&
      "total" in v &&
      number(v.total)),
  id: uuid,
  hubId: uuid,
  slug: string,
  title: string,
  description: nullableString,
  tags: strings,
  published: bool,
  linkSharingEnabled: bool,
  commentsEnabled: bool,
  version: number,
  createdAt: iso,
  updatedAt: iso,
} satisfies Shape<Collection>;
const profileShape = {
  id: uuid,
  username: string,
  displayName: string,
  bio: nullableString,
  timeZone: nullableString,
  showOwner: (v) => v === null || bool(v),
  handle: nullableString,
  handleChangeAvailableAt: nullableString,
  hubId: (v) => v === null || uuid(v),
  hubName: nullableString,
  email: string,
  hubDescription: nullableString,
  image: nullableString,
  createdAt: iso,
  updatedAt: iso,
} satisfies Shape<Profile>;
const resourceShape = {
  id: uuid,
  collectionId: uuid,
  kind: (v) => v === "external_link" || v === "collection_link" || v === "heading",
  url: string,
  linkedCollectionId: (v) => v === null || uuid(v),
  linkedCollection: (v) =>
    v === undefined ||
    v === null ||
    (typeof v === "object" && "id" in v && uuid(v.id) && "title" in v && string(v.title)),
  title: nullableString,
  description: nullableString,
  siteName: nullableString,
  addedBy: (v: unknown) =>
    v === null || (typeof v === "object" && v !== null && "userId" in v && "username" in v),
  tags: strings,
  position: number,
  version: number,
  createdAt: iso,
  updatedAt: iso,
} satisfies Shape<Resource>;
const sharedShape = {
  ...collectionShape,
  shareRole: role,
  shareSource: source,
} satisfies Shape<SharedCollection>;
const savedShape = {
  ...collectionShape,
  savedAt: iso,
  available: bool,
} satisfies Shape<SavedCollection>;
const shareShape = {
  userId: uuid,
  displayName: string,
  email: nullableString,
  role,
  source,
} satisfies Shape<CollectionShareView>;
const cursorShape = {
  section: (v: unknown) =>
    v === undefined ||
    (typeof v === "object" && v !== null && "id" in v && "kind" in v && v.kind === "heading"),
  limit: number,
  nextCursor: nullableString,
  auditFilters: (v: unknown) => v === undefined || (typeof v === "object" && v !== null),
} satisfies Shape<CursorMeta>;
const auditShape = {
  id: uuid,
  hubId: nullableString,
  actorKind: string,
  actorUserId: nullableString,
  actorUsername: nullableString,
  targetUsername: nullableString,
  collectionId: nullableString,
  targetUserId: nullableString,
  resourceId: nullableString,
  invitationId: nullableString,
  authority: nullableString,
  reason: nullableString,
  beforeState: nullableString,
  afterState: nullableString,
  outcome: nullableString,
  action: string,
  role: nullableString,
  createdAt: iso,
} satisfies Shape<AuditLogEntry>;

function shape(
  actual: Record<string, unknown>,
  fields: Record<string, (v: unknown) => boolean>,
  optional: string[] = [
    "auditFilters",
    "section",
    "restriction",
    "hub",
    "capabilities",
    "linkedCollection",
    "creator",
    "contributors",
  ],
) {
  expect(Object.keys(actual).sort()).toEqual(
    Object.keys(fields)
      .filter((key) => !optional.includes(key) || key in actual)
      .sort(),
  );
  for (const [key, validate] of Object.entries(fields)) {
    if (optional.includes(key) && !(key in actual)) continue;
    expect(validate(actual[key]), `Invalid wire field ${key}`).toBe(true);
  }
}
const secret = "never-export-email@example.com";
@Controller("contract-test")
class FailureController {
  @Get("framework") framework() {
    throw new HttpException({ code: secret, message: secret, details: { secret } }, 400);
  }
  @Get("unexpected") unexpected() {
    throw new Error(`SELECT password ${secret}`);
  }
}

describe("W3 serialized contracts and safe HTTP errors", () => {
  let app: INestApplication;
  let owner: string;
  let reader: string;
  let linkReader: string;
  let readerEmail: string;
  let cid: string;
  let ownerProfile: Profile;
  const suffix = crypto.randomUUID();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FailureController],
    }).compile();
    app = module.createNestApplication({ bodyParser: false, logger: false });
    configureApp(app);
    await app.init();
    async function signup(label: string) {
      const email = `${label}-${suffix}@example.com`;
      const res = await signInHubOwner(app.getHttpServer(), { email, name: label });
      return { token: res.headers["set-auth-token"] as string, email };
    }
    owner = (await signup("contract-owner")).token;
    const second = await signup("contract-reader");
    reader = second.token;
    readerEmail = second.email;
    linkReader = (await signup("contract-link")).token;
    const profile = await request(app.getHttpServer())
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    shape(profile.body.data, profileShape);
    ownerProfile = profile.body.data;
    const created = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${owner}`)
      .send({ slug: `contract-${suffix}`, title: "Contract", published: true })
      .expect(201);
    cid = created.body.data.id;
    shape(created.body.data, collectionShape);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("serializes profile, collection, permalink, handle, explore and resource reads", async () => {
    const server = app.getHttpServer();
    expect(ownerProfile.hubDescription).toBeNull();
    expect(ownerProfile.image).toBeNull();
    const byId = await request(server).get(`/api/v1/collections/${cid}`).expect(200);
    shape(byId.body.data, collectionShape);
    expect(byId.body.data.description).toBeNull();
    expect(Object.keys(byId.body.meta)).toEqual(["etag"]);
    for (const path of [`/hubs/${ownerProfile.hubId}`, `/hubs/by-handle/${ownerProfile.handle}`]) {
      const hub = await request(server).get(`/api/v1${path}`).expect(200);
      expect(Object.keys(hub.body.data).sort()).toEqual(["collections", "hub"]);
      expect(hub.body.data.hub).toEqual({
        id: ownerProfile.hubId,
        handle: ownerProfile.handle,
        name: ownerProfile.hubName,
        ownerName: ownerProfile.displayName || null,
        owner: { userId: ownerProfile.id, username: ownerProfile.username },
        description: null,
        publishedCollectionCount: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      expect(iso(hub.body.data.hub.createdAt)).toBe(true);
      expect(iso(hub.body.data.hub.updatedAt)).toBe(true);
      shape(hub.body.data.collections[0], collectionShape);
      shape(hub.body.meta, cursorShape);
    }
    const discover = await request(server).get("/api/v1/discover?limit=100").expect(200);
    shape(discover.body.meta, cursorShape);
    shape(
      discover.body.data.find((c: Collection) => c.id === cid),
      collectionShape,
    );
    const resource = await request(server)
      .post(`/api/v1/collections/${cid}/resources/external`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ url: "https://fixture-links.dev/contract", position: 0 })
      .expect(201);
    shape(resource.body.data, resourceShape);
    expect(resource.body.data.linkedCollectionId).toBeNull();
    expect(resource.body.data.title).toBeNull();
    const resources = await request(server).get(`/api/v1/collections/${cid}/resources`).expect(200);
    shape(resources.body.data[0], resourceShape);
    shape(resources.body.meta, cursorShape);
    const child = await request(server)
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${owner}`)
      .send({ slug: `child-${suffix}`, title: "Child" })
      .expect(201);
    await request(server)
      .post(`/api/v1/collections/${cid}/resources/collection`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ linkedCollectionId: child.body.data.id, position: 1 })
      .expect(201);
    const withReference = await request(server)
      .get(`/api/v1/collections/${cid}/resources`)
      .expect(200);
    const reference = withReference.body.data.find((r: Resource) => r.kind === "collection_link");
    shape(reference, resourceShape, ["url"]);
    expect(reference.url).toBeUndefined();
  });

  it("preserves sharing privacy, shared/saved lists and audit shapes", async () => {
    const server = app.getHttpServer();
    await request(server)
      .post(`/api/v1/collections/${cid}/shares`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ email: readerEmail, role: "viewer" })
      .expect(201);
    const link = await request(server)
      .put(`/api/v1/collections/${cid}/link-sharing`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ enabled: true })
      .expect(200);
    await request(server)
      .get(`/api/v1/collections/${cid}?s=${link.body.data.token}`)
      .set("Authorization", `Bearer ${linkReader}`)
      .expect(200);
    const shares = await request(server)
      .get(`/api/v1/collections/${cid}/shares`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    for (const share of shares.body.data) shape(share, shareShape);
    expect(shares.body.data.find((s: CollectionShareView) => s.source === "link").email).toBeNull();
    expect(shares.body.data.find((s: CollectionShareView) => s.source === "direct").email).toBe(
      readerEmail,
    );
    const shared = await request(server)
      .get("/api/v1/me/shared")
      .set("Authorization", `Bearer ${reader}`)
      .expect(200);
    shape(shared.body.data[0], sharedShape);
    await request(server)
      .post(`/api/v1/collections/${cid}/save`)
      .set("Authorization", `Bearer ${reader}`)
      .expect(201);
    const saved = await request(server)
      .get("/api/v1/me/saved")
      .set("Authorization", `Bearer ${reader}`)
      .expect(200);
    shape(saved.body.data[0], savedShape);
    expect(saved.body.data[0].available).toBe(true);
    await request(server)
      .post(`/api/v1/collections/${cid}/unpublish`)
      .set("Authorization", `Bearer ${owner}`)
      .expect(201);
    const dormant = await request(server)
      .get("/api/v1/me/saved")
      .set("Authorization", `Bearer ${reader}`)
      .expect(200);
    shape(dormant.body.data[0], savedShape);
    expect(dormant.body.data[0].available).toBe(false);
    const audit = await request(server)
      .get("/api/v1/manage/audit")
      .set("Authorization", `Bearer ${owner}`)
      .expect(200);
    for (const entry of audit.body.data) shape(entry, auditShape);
    shape(audit.body.meta, cursorShape);
  });

  it("returns indistinguishable hidden/missing 404s and actionable conflicts", async () => {
    const server = app.getHttpServer();
    const hidden = await request(server).get(`/api/v1/collections/${cid}`).expect(404);
    const missing = await request(server)
      .get(`/api/v1/collections/${crypto.randomUUID()}`)
      .expect(404);
    for (const res of [hidden, missing]) {
      expect(res.body.error).toEqual({
        code: "not_found",
        message: "Not found",
        requestId: res.headers["x-request-id"],
        details: {},
      });
    }
    const stale = await request(server)
      .patch(`/api/v1/collections/${cid}`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ version: 1, title: "stale" })
      .expect(409);
    expect(stale.body.error.code).toBe("version_conflict");
    const collision = await request(server)
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${owner}`)
      .send({ slug: `contract-${suffix}`, title: "collision" })
      .expect(409);
    expect(collision.body.error.code).toBe("slug_conflict");
  });

  it("bounds validation and never echoes submitted values, unknown field names or raw errors", async () => {
    const server = app.getHttpServer();
    const invalid = await request(server)
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${owner}`)
      .send({ slug: secret, title: "", [secret]: secret })
      .expect(400);
    expect(invalid.body.error.code).toBe("validation_failed");
    expect(invalid.body.error.details.issues).toContainEqual({ field: "slug", rule: "format" });
    expect(invalid.body.error.details.issues).toContainEqual({ field: "$", rule: "unknown_field" });
    const nested = await request(server)
      .patch(`/api/v1/collections/${cid}/resources/reorder`)
      .set("Authorization", `Bearer ${owner}`)
      .send({ items: [{ resourceId: secret, position: -1, version: 0 }] })
      .expect(400);
    expect(nested.body.error.details.issues).toContainEqual({
      field: "items.*.resourceId",
      rule: "uuid",
    });
    const framework = await request(server).get("/contract-test/framework").expect(400);
    const unexpected = await request(server).get("/contract-test/unexpected").expect(500);
    const malformed = await request(server)
      .post("/api/v1/collections")
      .set("Content-Type", "application/json")
      .send(`{"${secret}":`)
      .expect(400);
    const badUuid = await request(server).get(`/api/v1/collections/${secret}`).expect(400);
    const badCursor = await request(server)
      .get(
        `/api/v1/discover?cursor=${Buffer.from(JSON.stringify({ u: new Date().toISOString(), id: secret })).toString("base64url")}`,
      )
      .expect(400);
    expect(badCursor.body.error.code).toBe("invalid_cursor");
    for (const res of [invalid, nested, framework, unexpected, malformed, badUuid, badCursor]) {
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
      expect(Object.keys(res.body.error).sort()).toEqual([
        "code",
        "details",
        "message",
        "requestId",
      ]);
    }
  });

  it("preserves ready/degraded/unavailable status contracts without leaking probe errors", async () => {
    const service = app.get(HealthService);
    const readiness = spyOn(service, "readiness");
    try {
      for (const status of ["ready", "degraded", "unavailable"] as const) {
        const fixture: Readiness = {
          status,
          dependencies: {
            postgres: status === "unavailable" ? "unavailable" : "ready",
            redisQueue: status === "ready" ? "ready" : "unavailable",
          },
        };
        readiness.mockResolvedValueOnce(fixture);
        const res = await request(app.getHttpServer())
          .get("/api/v1/status")
          .expect(status === "unavailable" ? 503 : 200);
        if (status === "unavailable")
          expect(res.body.error.details).toEqual({ dependencies: fixture.dependencies });
        else expect(res.body.data).toEqual(fixture);
      }
    } finally {
      readiness.mockRestore();
    }
  });
});
