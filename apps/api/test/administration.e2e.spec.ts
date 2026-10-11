import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { RequestBudgetMaintenance } from "../src/common/request-budget-maintenance";
import { PrismaService } from "../src/database/prisma.service";
import { emailConfig } from "../src/email/config";
import { emailKey, unseal } from "../src/email/outbox";
import { prepareAdminInvitation } from "../src/operations/invitations";
import { expectSignIns } from "./fixtures/authentication-audit";
import { signInWithCode } from "./fixtures/sign-in";

describe("email-entry service invitations (HTTP)", () => {
  let app: INestApplication, p: PrismaService;
  type Actor = { id: string; email: string; cookie: string; token: string };
  let admin: Actor, operator: Actor;
  const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:4004";
  const email = () => `inv-${randomUUID()}@example.com`;
  const as = (method: "get" | "post", path: string, actor?: Actor) => {
    const r = request(app.getHttpServer())[method](path).set("Origin", origin);
    return actor ? r.set("Cookie", actor.cookie) : r;
  };
  async function login(address = email(), name = "Original name"): Promise<Actor> {
    const r = await signInWithCode(app.getHttpServer(), { email: address, name });
    return {
      id: r.body.user.id,
      email: address,
      token: r.headers["set-auth-token"],
      cookie: (r.headers["set-cookie"] as unknown as string[])
        .map((c) => c.split(";")[0])
        .join("; "),
    };
  }
  async function tokenFor(id: string) {
    const i = await p.serviceInvitation.findUniqueOrThrow({ where: { id } });
    const mail = await p.emailOutbox.findUniqueOrThrow({ where: { id: i.deliveryId as string } });
    const text = unseal(mail.payload as string, emailConfig().secret).text;
    const token = text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
    if (!token) throw new Error("Missing captured invitation token");
    return token;
  }
  const preview = (token: string, actor?: Actor) =>
    as("post", "/api/v1/auth/invitations/preview", actor).send({ token });
  const accept = (token: string, actor?: Actor, extra: Record<string, unknown> = {}) =>
    as("post", "/api/v1/auth/invitations/accept", actor).send({
      token,
      action: "accept",
      version: 1,
      operationId: randomUUID(),
      ...extra,
    });
  async function codeFor(address: string, invitation = false) {
    const mail = await p.emailOutbox.findFirstOrThrow({
      where: {
        recipientKey: emailKey(emailConfig().suppressionSecret, "recipient", address),
        state: "pending",
      },
      orderBy: { createdAt: "desc" },
    });
    const payload = unseal(mail.payload as string, emailConfig().secret);
    if (invitation) {
      expect(payload.subject).toBe("Verify your email to accept your linkhub invitation");
      expect(payload.text).toContain("activate your invited role");
    }
    const code = payload.text.match(/^\d{8}$/m)?.[0];
    if (!code) throw new Error("Missing captured code");
    return code;
  }
  async function verifyInvite(token: string, address: string, actor?: Actor): Promise<Actor> {
    const r = await as("post", "/api/v1/auth/invitations/verify", actor)
      .send({ token, code: await codeFor(address) })
      .expect(200);
    return {
      id: r.body.user.id,
      email: address,
      token: r.headers["set-auth-token"],
      cookie: (r.headers["set-cookie"] as unknown as string[])
        .map((c) => c.split(";")[0])
        .join("; "),
    };
  }
  async function invite(address = email()) {
    const r = await as("post", "/api/v1/operations/operator-invitations", admin)
      .send({ email: address, operationId: randomUUID() })
      .expect(201);
    return { id: r.body.data.id as string, token: await tokenFor(r.body.data.id), email: address };
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    p = app.get(PrismaService);
    admin = await login();
  });
  beforeEach(async () => {
    await p.requestBudget.deleteMany();
  });
  afterAll(async () => {
    await app?.close();
  });
  it("bootstraps once and requires fresh email proof even for a matching signed-in account", async () => {
    const [a, b] = await Promise.all([
      prepareAdminInvitation(p, admin.email),
      prepareAdminInvitation(p, admin.email),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.id).toBe(b.id);
    const original = await p.serviceInvitation.findUniqueOrThrow({ where: { id: a.id as string } });
    const mailCount = await p.emailOutbox.count();
    expect(await prepareAdminInvitation(p, admin.email)).toEqual({ created: false, id: a.id });
    expect(await prepareAdminInvitation(p, "changed@example.com")).toEqual({
      created: false,
      id: a.id,
    });
    expect(await p.emailOutbox.count()).toBe(mailCount);
    expect(await p.serviceInvitation.findUnique({ where: { id: a.id as string } })).toEqual(
      original,
    );
    const token = await tokenFor(a.id as string);
    const state = (await preview(token, admin).expect(200)).body;
    expect(state.session).toBe("match");
    expect(state.needsName).toBe(false);
    expect(await p.adminGrant.count()).toBe(0);
    await p.session.updateMany({ where: { userId: admin.id }, data: { verifiedAt: new Date(0) } });
    const mails = await p.emailOutbox.count();
    const accepted = await accept(token, admin, { version: state.version }).expect(200);
    expect(accepted.body.signedIn).toBe(false);
    expect(accepted.headers["set-cookie"]).toBeUndefined();
    expect(await p.emailOutbox.count()).toBe(mails + 1);
    expect(await p.adminGrant.count()).toBe(0);
    await as("get", "/api/v1/operations/accounts", admin).expect(403);
    admin = await verifyInvite(token, admin.email, admin);
    expect((await p.user.findUniqueOrThrow({ where: { id: admin.id } })).name).toBe(
      "Original name",
    );
    expect(await p.adminGrant.count()).toBe(1);
    await p.session.updateMany({ where: { userId: admin.id }, data: { verifiedAt: new Date() } });
  });
  it("stores invitations only until acceptance, then creates a named unverified account without a hub and sends OTP without establishing a session", async () => {
    const i = await invite();
    expect(await p.user.findUnique({ where: { email: i.email } })).toBeNull();
    expect((await preview(i.token).expect(200)).body.needsName).toBe(true);
    expect(await p.user.findUnique({ where: { email: i.email } })).toBeNull();
    await accept(i.token).expect(400);
    expect(await p.user.findUnique({ where: { email: i.email } })).toBeNull();
    const result = await accept(i.token, undefined, { name: "New operator" }).expect(200);
    expect(result.body.signedIn).toBe(false);
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(result.headers["set-auth-token"]).toBeUndefined();
    const user = await p.user.findUniqueOrThrow({
      where: { email: i.email },
      include: { hub: true },
    });
    expect(user.name).toBe("New operator");
    expect(user.emailVerified).toBe(false);
    expect(user.hub).toBeNull();
    expect(user.username).toBeString();
    expect(await p.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await p.operatorGrant.findUnique({ where: { userId: user.id } })).toBeNull();
    const code = await codeFor(i.email, true);
    await as("post", "/api/v1/auth/code/verify").send({ email: i.email, code }).expect(400);
    operator = await verifyInvite(i.token, i.email);
    expect((await p.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
    await as("get", "/api/v1/operations/accounts", operator).expect(200);
  });
  it("declining, cancelling, expiring and abandoning invitations creates no user or personal hub", async () => {
    const before = await p.user.count(),
      hubs = await p.hub.count();
    const declined = await invite(),
      cancelled = await invite(),
      expired = await invite(),
      abandoned = await invite();
    await accept(declined.token, undefined, { action: "decline" }).expect(200);
    await as("post", `/api/v1/operations/operator-invitations/${cancelled.id}`, admin)
      .send({ action: "cancel", version: 1, operationId: randomUUID() })
      .expect(201);
    await p.serviceInvitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(0) },
    });
    await accept(expired.token, undefined, { name: "Unused" }).expect(404);
    await preview(abandoned.token).expect(200);
    expect(await p.user.count()).toBe(before);
    expect(await p.hub.count()).toBe(hubs);
  });
  it("requires the email token and an exact Origin even without cookies; rejects bearer and mismatched sessions", async () => {
    const i = await invite();
    await accept("bad-token", undefined, { name: "Name" }).expect(404);
    await request(app.getHttpServer())
      .post("/api/v1/auth/invitations/accept")
      .send({
        token: i.token,
        name: "Name",
        version: 1,
        action: "accept",
        operationId: randomUUID(),
      })
      .expect(403);
    await as("post", "/api/v1/auth/invitations/preview")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ token: i.token })
      .expect(403);
    expect((await preview(i.token, admin).expect(200)).body.session).toBe("mismatch");
    expect((await accept(i.token, admin, { name: "Name" }).expect(403)).body.error.code).toBe(
      "invitation_session_mismatch",
    );
    expect(await p.user.findUnique({ where: { email: i.email } })).toBeNull();
    await as("get", "/api/v1/invitations", admin).expect(404);
    await as("get", `/api/v1/invitations/${i.id}`, admin).expect(404);
    await as("post", `/api/v1/invitations/${i.id}`, admin)
      .send({ action: "accept", version: 1, operationId: randomUUID() })
      .expect(404);
  });
  it("existing signed-out accounts accept then receive a code without having their name overwritten", async () => {
    const target = await login(),
      i = await invite(target.email);
    expect((await preview(i.token).expect(200)).body.needsName).toBe(false);
    const sessions = await p.session.count({ where: { userId: target.id } });
    expect(
      (await accept(i.token, undefined, { name: "Do not overwrite" }).expect(200)).body.signedIn,
    ).toBe(false);
    expect((await p.user.findUniqueOrThrow({ where: { id: target.id } })).name).toBe(
      "Original name",
    );
    expect(await p.session.count({ where: { userId: target.id } })).toBe(sessions);
  });
  it("deduplicates acceptance and delivery and never recreates a revoked role", async () => {
    const target = await login(),
      i = await invite(target.email),
      operationId = randomUUID();
    await accept(i.token, target, { operationId }).expect(200);
    const mails = await p.emailOutbox.count();
    await verifyInvite(i.token, target.email, target);
    await as("post", `/api/v1/operations/operators/${target.id}/revoke`, admin)
      .send({ version: 2, operationId: randomUUID() })
      .expect(201);
    await accept(i.token, target, { operationId }).expect(200);
    expect(await p.operatorGrant.findUnique({ where: { userId: target.id } })).toBeNull();
    expect(await p.emailOutbox.count()).toBe(mails);
    await accept(i.token, target, { operationId, name: "Changed" }).expect(409);
  });
  it("resend rotates email tokens and cancellation competes safely with acceptance", async () => {
    const i = await invite();
    await as("post", `/api/v1/operations/operator-invitations/${i.id}`, admin)
      .send({ action: "resend", version: 1, operationId: randomUUID() })
      .expect(201);
    await preview(i.token).expect(404);
    const token = await tokenFor(i.id);
    const [cancel, accepted] = await Promise.all([
      as("post", `/api/v1/operations/operator-invitations/${i.id}`, admin).send({
        action: "cancel",
        version: 2,
        operationId: randomUUID(),
      }),
      accept(token, undefined, { name: "Race", version: 2 }),
    ]);
    expect([cancel.status, accepted.status].sort()).toEqual(
      cancel.status === 201 ? [201, 409] : [200, 409],
    );
    const row = await p.serviceInvitation.findUniqueOrThrow({ where: { id: i.id } });
    expect(!!(await p.user.findUnique({ where: { email: i.email } }))).toBe(
      row.state === "verifying",
    );
  });
  it("rolls back new account, hub, grant, acceptance and mail on audit or OTP delivery failure", async () => {
    for (const table of ["audit_logs", "email_outbox"]) {
      const i = await invite(),
        users = await p.user.count(),
        hubs = await p.hub.count();
      await p.$executeRawUnsafe(
        "CREATE FUNCTION fail_invite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$",
      );
      await p.$executeRawUnsafe(
        `CREATE TRIGGER fail_invite BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_invite()`,
      );
      try {
        await accept(i.token, undefined, { name: "Rollback" }).expect(503);
        expect(await p.user.count()).toBe(users);
        expect(await p.hub.count()).toBe(hubs);
        expect((await p.serviceInvitation.findUniqueOrThrow({ where: { id: i.id } })).state).toBe(
          "pending",
        );
      } finally {
        await p.$executeRawUnsafe(`DROP TRIGGER fail_invite ON ${table}`);
        await p.$executeRawUnsafe("DROP FUNCTION fail_invite()");
      }
    }
  });
  it("binds verification to the invitation, limits wrong codes and invalidates replaced or cancelled proofs", async () => {
    const target = await login(),
      i = await invite(target.email);
    await accept(i.token, target).expect(200);
    expect(await p.operatorGrant.findUnique({ where: { userId: target.id } })).toBeNull();
    await as("get", "/api/v1/operations/accounts", target).expect(403);
    const code = await codeFor(target.email);
    const wrong = code === "00000000" ? "11111111" : "00000000";
    for (let n = 0; n < 3; n++)
      await as("post", "/api/v1/auth/invitations/verify", target)
        .send({ token: i.token, code: wrong })
        .expect(400);
    await as("post", "/api/v1/auth/invitations/verify", target)
      .send({ token: i.token, code })
      .expect(403);
    await as("post", "/api/v1/auth/invitations/resend", target)
      .send({ token: i.token })
      .expect(200);
    const replacement = await codeFor(target.email, true);
    await as("post", `/api/v1/operations/operator-invitations/${i.id}`, admin)
      .send({ action: "resend", version: 2, operationId: randomUUID() })
      .expect(201);
    await as("post", "/api/v1/auth/invitations/verify", target)
      .send({ token: i.token, code: replacement })
      .expect(404);
    const token = await tokenFor(i.id);
    await accept(token, target, { version: 3 }).expect(200);
    const next = await codeFor(target.email);
    await as("post", `/api/v1/operations/operator-invitations/${i.id}`, admin)
      .send({ action: "cancel", version: 4, operationId: randomUUID() })
      .expect(201);
    await as("post", "/api/v1/auth/invitations/verify", target)
      .send({ token, code: next })
      .expect(409);
    expect(await p.operatorGrant.findUnique({ where: { userId: target.id } })).toBeNull();
  });
  it("does not accept ordinary login codes as invitation proof or consume proof when grant audit fails", async () => {
    const i = await invite();
    await accept(i.token, undefined, { name: "Verified invitee" }).expect(200);
    const code = await codeFor(i.email, true);
    await as("post", "/api/v1/auth/code/send").send({ email: i.email }).expect(200);
    const loginCode = await codeFor(i.email);
    if (loginCode !== code)
      await as("post", "/api/v1/auth/invitations/verify")
        .send({ token: i.token, code: loginCode })
        .expect(400);
    const user = await p.user.findUniqueOrThrow({ where: { email: i.email } });
    await expectSignIns(p, user.id, []);
    await p.$executeRawUnsafe(
      "CREATE FUNCTION fail_verify() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test'; END $$",
    );
    await p.$executeRawUnsafe(
      "CREATE TRIGGER fail_verify BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_verify()",
    );
    try {
      await as("post", "/api/v1/auth/invitations/verify")
        .send({ token: i.token, code })
        .expect(503);
      expect(await p.operatorGrant.findUnique({ where: { userId: user.id } })).toBeNull();
      expect(await p.session.count({ where: { userId: user.id } })).toBe(0);
      await expectSignIns(p, user.id, []);
      expect((await p.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(
        false,
      );
      expect((await p.serviceInvitation.findUniqueOrThrow({ where: { id: i.id } })).state).toBe(
        "verifying",
      );
    } finally {
      await p.$executeRawUnsafe("DROP TRIGGER fail_verify ON audit_logs");
      await p.$executeRawUnsafe("DROP FUNCTION fail_verify()");
    }
    await as("post", "/api/v1/auth/invitations/verify").send({ token: i.token, code }).expect(200);
    await as("post", "/api/v1/auth/invitations/verify").send({ token: i.token, code }).expect(409);
    await expectSignIns(p, user.id, ["email"]);
  });
  it("keeps operator administration admin-only and role authority separate from private content", async () => {
    await as("post", "/api/v1/operations/operator-invitations", operator)
      .send({ email: email(), operationId: randomUUID() })
      .expect(403);
    await as("get", "/api/v1/operations/operators", operator).expect(403);
    await as("post", "/api/v1/operations/commands", operator)
      .send({
        action: "sessions.revoke",
        targetId: admin.id,
        reason: "account_compromise",
        version: 2,
        operationId: randomUUID(),
      })
      .expect(403);
  });
  it("checks inviter loss, keeps bootstrap restart inert, and requires consent for zero-admin recovery", async () => {
    const i = await invite();
    const waiting = await invite();
    await accept(waiting.token, undefined, { name: "Waiting" }).expect(200);
    const waitingCode = await codeFor(waiting.email);
    await p.adminGrant.delete({ where: { userId: admin.id } });
    await accept(i.token, undefined, { name: "No access" }).expect(409);
    await as("post", "/api/v1/auth/invitations/verify")
      .send({ token: waiting.token, code: waitingCode })
      .expect(409);
    expect(await p.user.findUnique({ where: { email: i.email } })).toBeNull();
    expect((await prepareAdminInvitation(p, admin.email)).created).toBe(false);
    const recovered = await prepareAdminInvitation(p, admin.email, true, "test-recovery");
    expect(await p.adminGrant.count()).toBe(0);
    const recoveryToken = await tokenFor(recovered.id as string);
    await accept(recoveryToken, admin).expect(200);
    admin = await verifyInvite(recoveryToken, admin.email, admin);
    const accepted = await p.serviceInvitation.findFirstOrThrow({
      where: { acceptedById: operator.id },
    });
    await p.serviceInvitation.update({
      where: { id: accepted.id },
      data: { expiresAt: new Date(0) },
    });
    await app.get(RequestBudgetMaintenance).prune();
    expect(await p.operatorGrant.findUnique({ where: { userId: operator.id } })).not.toBeNull();
  });
});
