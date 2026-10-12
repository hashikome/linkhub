import { afterAll, beforeAll, expect, it } from "bun:test";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { type RecoveryCommand, recoveryProof } from "@ntumie/config/action-recovery";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { RequestBudgetMaintenance } from "../src/common/request-budget-maintenance";
import { PrismaService } from "../src/database/prisma.service";

let app: INestApplication, db: PrismaService;
const previous = process.env.WEB_SOURCE_SECRET;
const secret = "synthetic-recovery-secret-with-32-characters";
beforeAll(async () => {
  process.env.WEB_SOURCE_SECRET = secret;
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
  db = app.get(PrismaService);
});
afterAll(async () => {
  // Rejected requests can leave sockets open before body parsing. This suite owns them.
  app?.getHttpServer().closeAllConnections();
  await app?.close();
  if (previous === undefined) delete process.env.WEB_SOURCE_SECRET;
  else process.env.WEB_SOURCE_SECRET = previous;
});
const send = (body: RecoveryCommand, proof = recoveryProof(body, secret)) =>
  request(app.getHttpServer())
    .post("/api/v1/action-recovery")
    .set("Connection", "close")
    .set("x-action-recovery", proof)
    .send(body);
it("protects shared recovery storage, preserves retry-safe payloads, deletes and expires them", async () => {
  const token = randomBytes(32).toString("hex");
  const put: RecoveryCommand = { operation: "put", token, payload: "a".repeat(5000) };
  await send(put, "").expect(403);
  await send(put, recoveryProof(put, "wrong")).expect(403);
  await send(put, recoveryProof(put, secret, Date.now() - 61_000)).expect(403);
  await send(put).expect(201);
  await send(put).expect(201);
  const tokenHash = createHash("sha256").update(token).digest("hex");
  expect(await db.pendingActionPayload.count({ where: { tokenHash } })).toBe(1);
  const get: RecoveryCommand = { operation: "get", token };
  await send(get, recoveryProof(put, secret)).expect(403);
  expect((await send(get).expect(201)).body.data.payload).toBe(put.payload);
  await send({ ...put, payload: "different" }).expect(409);
  await send({ ...put, token: randomBytes(32).toString("hex"), payload: "a".repeat(65537) }).expect(
    400,
  );
  await db.pendingActionPayload.update({ where: { tokenHash }, data: { expiresAt: new Date(0) } });
  expect((await send(get).expect(201)).body.data.payload).toBeNull();
  await app.get(RequestBudgetMaintenance).prune();
  expect(await db.pendingActionPayload.count({ where: { tokenHash } })).toBe(0);
  await send(put).expect(201);
  await send({ operation: "delete", token }).expect(201);
  expect((await send(get).expect(201)).body.data.payload).toBeNull();
});

it("isolates recovery storage budgets for visitors sharing the web server", async () => {
  const proof = (source: string, purpose = "form") => {
    const payload = Buffer.from(JSON.stringify([1, source, Date.now()])).toString("base64url");
    return `${payload}.${createHmac("sha256", secret).update(`web-${purpose}-source:${payload}`).digest("base64url")}`;
  };
  const token = randomBytes(32).toString("hex");
  const get: RecoveryCommand = { operation: "get", token };
  // SSR retrieval is a POST, too. Exhaust only visitor A's write allowance.
  for (let i = 0; i < 60; i++)
    await send(get).set("x-web-form-source", proof("192.0.2.81")).expect(201);
  await send(get).set("x-web-form-source", proof("192.0.2.81")).expect(429);
  const put: RecoveryCommand = { operation: "put", token, payload: "ciphertext" };
  await send(put).set("x-web-form-source", proof("192.0.2.82")).expect(201);
  expect(
    (await send(get).set("x-web-form-source", proof("192.0.2.82")).expect(201)).body.data.payload,
  ).toBe("ciphertext");
  await send({ operation: "delete", token })
    .set("x-web-form-source", proof("192.0.2.82"))
    .expect(201);
  // A read-domain proof cannot bypass the exhausted POST budget.
  await send(get)
    .set("x-web-form-source", proof("192.0.2.81"))
    .set("x-web-read-source", proof("192.0.2.82", "read"))
    .expect(429);
});
