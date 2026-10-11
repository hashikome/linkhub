import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/database/prisma.service";
import { signInHubOwner } from "./fixtures/sign-in";

// Drive-style collection ownership transfer: only the owner can transfer, only
// to an existing editor; the collection moves into the recipient's hub and the
// previous owner keeps editor access in their shared/ surface.
describe("Collection transfer (e2e)", () => {
  let app: INestApplication<App>;
  const sfx = Date.now().toString(36);

  const signUp = async (label: string) => {
    const email = `${label}_${sfx}@example.com`;
    const res = await signInHubOwner(app.getHttpServer(), { email, name: `${label} ${sfx}` });
    const bearer = res.headers["set-auth-token"];
    const profile = await request(app.getHttpServer())
      .get("/api/v1/profile")
      .set("Authorization", `Bearer ${bearer}`)
      .expect(200);
    return { bearer, email, userId: (profile.body as { data: { id: string } }).data.id };
  };

  const createCollection = async (bearer: string, title: string) => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .set("Authorization", `Bearer ${bearer}`)
      .send({ title, published: false })
      .expect(201);
    return (res.body as { data: { id: string } }).data.id;
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

  it("transfers ownership to an existing editor and flips authority", async () => {
    const alice = await signUp("owner");
    const bob = await signUp("editor");
    const cid = await createCollection(alice.bearer, `xfer-${sfx}`);

    const existing = await createCollection(bob.bearer, `xfer-${sfx}`);
    expect(existing).not.toBe(cid);

    // Alice shares with Bob as editor (the precondition for transfer).
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/shares`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ email: bob.email, role: "contributor" })
      .expect(201);

    // Transfer.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/transfer`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ email: bob.email })
      .expect(201);
    expect((res.body as { data: { transferredTo: string } }).data.transferredTo).toBe(bob.userId);

    // Bob now owns it: he can manage (publish).
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/publish`)
      .set("Authorization", `Bearer ${bob.bearer}`)
      .expect(201);

    // Alice can no longer manage it (403), but still reads it as an editor.
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/publish`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${cid}/resources`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .expect(200);

    // It lands in Alice's shared/ surface.
    const shared = await request(app.getHttpServer())
      .get("/api/v1/me/shared")
      .set("Authorization", `Bearer ${alice.bearer}`)
      .expect(200);
    expect(JSON.stringify(shared.body)).toContain(cid);
    expect(
      shared.body.data.find((item: { id: string; shareRole: string }) => item.id === cid)
        ?.shareRole,
    ).toBe("contributor");
  });

  it("leaves other editors and viewers untouched after transfer", async () => {
    const alice = await signUp("owner3");
    const bob = await signUp("newowner3");
    const dave = await signUp("editor3");
    const eve = await signUp("viewer3");
    const cid = await createCollection(alice.bearer, `xfer3-${sfx}`);

    // Bob is the transfer target (editor); Dave is a third-party editor; Eve a
    // third-party reader. Only Bob and the previous owner should change.
    for (const [who, role] of [
      [bob, "contributor"],
      [dave, "contributor"],
      [eve, "viewer"],
    ] as const) {
      await request(app.getHttpServer())
        .post(`/api/v1/collections/${cid}/shares`)
        .set("Authorization", `Bearer ${alice.bearer}`)
        .send({ email: who.email, role })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/transfer`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ email: bob.email })
      .expect(201);

    // Dave still has editor access — can write content.
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/resources/external`)
      .set("Authorization", `Bearer ${dave.bearer}`)
      .send({ url: `https://fixture-links.dev/dave-${sfx}`, position: 0 })
      .expect(201);

    // Eve still has reader access — can read, cannot write.
    await request(app.getHttpServer())
      .get(`/api/v1/collections/${cid}/resources`)
      .set("Authorization", `Bearer ${eve.bearer}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/resources/external`)
      .set("Authorization", `Bearer ${eve.bearer}`)
      .send({ url: `https://fixture-links.dev/eve-${sfx}`, position: 1 })
      .expect(403);
  });

  it("rejects transfer to a non-editor and to self", async () => {
    const alice = await signUp("owner2");
    const carol = await signUp("stranger");
    const cid = await createCollection(alice.bearer, `xfer2-${sfx}`);

    // Carol is not an editor → rejected.
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/transfer`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ email: carol.email })
      .expect(400);

    // Transferring to self → rejected.
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${cid}/transfer`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ email: alice.email })
      .expect(400);
  });

  it("transfers only the chosen collection and removes confirmed references", async () => {
    const alice = await signUp("xowner");
    const bob = await signUp("xnewowner");
    const root = await createCollection(alice.bearer, `xroot-${sfx}`);
    const section = await createCollection(alice.bearer, `xsec-${sfx}`);

    await request(app.getHttpServer())
      .post(`/api/v1/collections/${root}/resources/collection`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ linkedCollectionId: section, position: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${root}/shares`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ email: bob.email, role: "contributor" })
      .expect(201);
    const impact = await request(app.getHttpServer())
      .get(`/api/v1/collections/${root}/impact?action=transfer`)
      .auth(alice.bearer, { type: "bearer" })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${root}/transfer`)
      .set("Authorization", `Bearer ${alice.bearer}`)
      .send({ email: bob.email, impactToken: impact.body.data.token })
      .expect(201);

    // The referenced collection stays with Alice. Bob cannot manage it.
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${section}/publish`)
      .set("Authorization", `Bearer ${bob.bearer}`)
      .expect(403);

    // The confirmed reference is removed; the destination remains independently owned.
    const stored = await app
      .get(PrismaService)
      .resource.findMany({ where: { collectionId: root }, select: { linkedCollectionId: true } });
    expect(stored).toEqual([]);
    const resources = await request(app.getHttpServer())
      .get(`/api/v1/collections/${root}/resources`)
      .set("Authorization", `Bearer ${bob.bearer}`)
      .expect(200);
    expect(resources.body.data).toHaveLength(0);
    expect(JSON.stringify(resources.body)).not.toContain(section);
  });
});
