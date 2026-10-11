import { afterAll, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDeliveryAuth } from "../src/auth/delivery-auth";
import { googleConnectionCookie, stageGoogleConnection } from "../src/auth/google-connection";
import { emailKey, unseal } from "../src/email/outbox";
import { PrismaClient } from "../src/generated/prisma/client";
import { expectSignIns } from "./fixtures/authentication-audit";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const secret = "registration-test-secret-32-characters";
const suppressionSecret = "registration-test-suppression-independent";
const config = {
  prisma,
  secret,
  suppressionSecret,
  baseURL: "http://localhost:4004",
  supportUrl: "https://example.com/support",
};
const auth = createDeliveryAuth(config);
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
function call(path: string, body?: unknown, cookie = "", instance = auth) {
  return instance.handler(
    new Request(`http://localhost:4004/api/v1/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        origin: "http://localhost:4004",
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function issue() {
  const email = `signup-${randomUUID()}@example.com`;
  expect((await call("/code/send", { email })).status).toBe(200);
  const mail = await prisma.emailOutbox.findFirstOrThrow({
    where: { recipientKey: emailKey(suppressionSecret, "recipient", email) },
    orderBy: { createdAt: "desc" },
  });
  const code = unseal(mail.payload ?? "", secret).text.match(/^\d{8}$/m)?.[0];
  return { email, code };
}
async function pending() {
  const signIns = await prisma.auditLog.count({
    where: { action: { startsWith: "security.sign_in." } },
  });
  const proof = await issue();
  const response = await call("/code/verify", proof);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ registrationRequired: true });
  expect(response.headers.get("set-auth-token")).toBeNull();
  expect(await prisma.user.findUnique({ where: { email: proof.email } })).toBeNull();
  expect(
    await prisma.auditLog.count({ where: { action: { startsWith: "security.sign_in." } } }),
  ).toBe(signIns);
  return { ...proof, cookie: cookies(response) };
}
afterAll(() => prisma.$disconnect());
it("requires explicit consent after verified absence; creates one account and optional hub atomically", async () => {
  for (const withHub of [false, true]) {
    const proof = await pending();
    const preview = await call("/email-registration", undefined, proof.cookie);
    expect((await preview.json()).data.email).toBe(proof.email);
    expect((await call("/email-registration/confirm", { confirm: true })).status).toBe(404);
    expect(
      (await call("/email-registration/confirm", { confirm: false }, proof.cookie)).status,
    ).toBe(400);
    expect(
      (await call("/email-registration/confirm", { confirm: true, hubName: " " }, proof.cookie))
        .status,
    ).toBe(400);
    const response = await call(
      "/email-registration/confirm",
      { confirm: true, ...(withHub ? { hubName: "Engineering toolkit" } : {}) },
      proof.cookie,
    );
    expect(response.status).toBe(200);
    const user = (await response.json()).user;
    expect(user.email).toBe(proof.email);
    expect(user.emailVerified).toBe(true);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.username).toBeTruthy();
    expect(stored.lastLoginAt).not.toBeNull();
    await expectSignIns(prisma, user.id, ["email"]);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.authenticationMethod).toBe("email");
    expect(session.verifiedAt).toEqual(stored.lastLoginAt);
    const hub = await prisma.hub.findUnique({ where: { ownerUserId: user.id } });
    if (withHub) {
      expect(hub?.name).toBe("Engineering toolkit");
      expect(hub?.handle).toBe(stored.username);
      expect(
        await prisma.hubHandleReservation.findUnique({ where: { handle: stored.username } }),
      ).not.toBeNull();
    } else expect(hub).toBeNull();
    expect(
      (await call("/email-registration/confirm", { confirm: true }, proof.cookie)).status,
    ).toBe(404);
    expect((await call("/code/verify", { email: proof.email, code: proof.code })).status).toBe(400);
    await expectSignIns(prisma, user.id, ["email"]);
  }
});
it("bad and exhausted codes cannot stage account creation", async () => {
  const proof = await issue();
  const wrong = proof.code === "00000000" ? "11111111" : "00000000";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await call("/code/verify", { email: proof.email, code: wrong });
    expect(response.status).toBe(400);
    expect(cookies(response)).not.toContain("email_registration");
  }
  expect((await call("/code/verify", proof)).status).toBe(403);
  expect(await prisma.user.findUnique({ where: { email: proof.email } })).toBeNull();
});
it("expired codes and staged proofs cannot create accounts", async () => {
  const proof = await issue();
  await prisma.verification.updateMany({
    where: { identifier: `sign-in-otp-${proof.email}` },
    data: { expiresAt: new Date(0) },
  });
  expect((await call("/code/verify", proof)).status).toBe(400);
  const staged = await pending();
  await prisma.verification.updateMany({
    where: { identifier: { startsWith: "email-registration:" } },
    data: { expiresAt: new Date(0) },
  });
  expect((await call("/email-registration/confirm", { confirm: true }, staged.cookie)).status).toBe(
    404,
  );
});
it("cancellation and restarting email sign-in discard earlier creation proof", async () => {
  for (const action of ["/email-registration/cancel", "/sign-in/identify"]) {
    const proof = await pending();
    expect(
      (
        await call(
          action,
          action.endsWith("identify") ? { email: "different@example.com" } : {},
          proof.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (await call("/email-registration/confirm", { confirm: true }, proof.cookie)).status,
    ).toBe(404);
  }
});
it("a racing account cannot turn creation consent into authentication", async () => {
  const proof = await pending();
  await prisma.user.create({
    data: {
      email: proof.email,
      name: "Racer",
      username: `race-${randomUUID().slice(0, 8)}`,
      emailVerified: true,
    },
  });
  expect((await call("/email-registration/confirm", { confirm: true }, proof.cookie)).status).toBe(
    404,
  );
});
it("commit failures roll back OTP consumption, creation consent, account and hub", async () => {
  const broken = createDeliveryAuth({
    ...config,
    beforeCommit: async () => {
      throw new Error("commit failure");
    },
  });
  const proof = await issue();
  expect((await call("/code/verify", proof, "", broken)).status).toBe(503);
  const response = await call("/code/verify", proof);
  expect(response.status).toBe(200);
  const cookie = cookies(response);
  expect(
    (
      await call(
        "/email-registration/confirm",
        { confirm: true, hubName: "My hub" },
        cookie,
        broken,
      )
    ).status,
  ).toBe(503);
  expect(await prisma.user.findUnique({ where: { email: proof.email } })).toBeNull();
  expect(
    (await call("/email-registration/confirm", { confirm: true, hubName: "My hub" }, cookie))
      .status,
  ).toBe(200);
});

it("cannot commit email registration without its authentication audit event", async () => {
  const proof = await pending();
  const before = {
    sessions: await prisma.session.count(),
    hubs: await prisma.hub.count(),
    signIns: await prisma.auditLog.count({ where: { action: "security.sign_in.email" } }),
  };
  await prisma.$executeRawUnsafe(
    "CREATE FUNCTION reject_registration_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'security.sign_in.email' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$",
  );
  await prisma.$executeRawUnsafe(
    "CREATE TRIGGER reject_registration_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_registration_audit()",
  );
  try {
    const failed = await call(
      "/email-registration/confirm",
      { confirm: true, hubName: "Atomic signup" },
      proof.cookie,
    );
    expect(failed.status).toBe(503);
    expect(failed.headers.get("set-cookie")).toBeNull();
    expect(failed.headers.get("set-auth-token")).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: proof.email } })).toBeNull();
    expect(await prisma.session.count()).toBe(before.sessions);
    expect(await prisma.hub.count()).toBe(before.hubs);
    expect(await prisma.auditLog.count({ where: { action: "security.sign_in.email" } })).toBe(
      before.signIns,
    );
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER reject_registration_audit ON audit_logs");
    await prisma.$executeRawUnsafe("DROP FUNCTION reject_registration_audit()");
  }
  const retry = await call(
    "/email-registration/confirm",
    { confirm: true, hubName: "Atomic signup" },
    proof.cookie,
  );
  expect(retry.status).toBe(200);
  const user = (await retry.json()).user;
  await expectSignIns(prisma, user.id, ["email"]);
  expect(await prisma.hub.count({ where: { ownerUserId: user.id } })).toBe(1);
});

it("allocates a matching username and hub handle without reusing a retired identity", async () => {
  const owner = await prisma.user.create({
    data: {
      email: `retired-${randomUUID()}@example.com`,
      name: "Owner",
      username: `owner-${randomUUID().slice(0, 8)}`,
    },
  });
  const stem = `reader-${randomUUID().slice(0, 8)}`;
  const hub = await prisma.hub.create({
    data: { ownerUserId: owner.id, name: "Original", handle: stem },
  });
  await prisma.hub.update({ where: { id: hub.id }, data: { handle: `${stem}-old` } });
  const identity = {
    subject: randomUUID(),
    email: `google-${randomUUID()}@example.com`,
    name: stem,
  };
  const token = await stageGoogleConnection(prisma, secret, identity);
  const google = createDeliveryAuth({
    ...config,
    google: { clientId: "synthetic-client", clientSecret: "synthetic-secret" },
  });
  const response = await call(
    "/google-connection/register",
    { confirm: true, hubName: "New purpose" },
    `${googleConnectionCookie(config.baseURL)}=${token}`,
    google,
  );
  expect(response.status).toBe(200);
  const user = (await response.json()).user;
  expect(user.username).toBe(`${stem}-2`);
  await expectSignIns(prisma, user.id, ["google"]);
  const created = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: user.id } });
  expect(created.handle).toBe(user.username);
  expect(created.name).toBe("New purpose");
});

it("consumes creation consent once across simultaneous confirmations", async () => {
  const proof = await pending();
  const replies = await Promise.all(
    [1, 2].map(() =>
      call("/email-registration/confirm", { confirm: true, hubName: "One hub" }, proof.cookie),
    ),
  );
  expect(replies.map((reply) => reply.status).sort()).toEqual([200, 404]);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: proof.email } });
  expect(await prisma.hub.count({ where: { ownerUserId: user.id } })).toBe(1);
  expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  await expectSignIns(prisma, user.id, ["email"]);
});
