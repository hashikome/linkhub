import { afterAll, describe, expect, it } from "bun:test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDeliveryAuth } from "../src/auth/delivery-auth";
import { googleConnectionCookie, stageGoogleConnection } from "../src/auth/google-connection";
import { emailKey, unseal } from "../src/email/outbox";
import { PrismaClient } from "../src/generated/prisma/client";
import { invitationDigest } from "../src/operations/invitations";
import { expectSignIns } from "./fixtures/authentication-audit";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const secret = "security-test-only-secret-independent-32";
const suppressionSecret = "security-test-only-suppression-independent";
const baseURL = "http://localhost:4004";
const webOrigin = "http://localhost:3004";
const config = {
  prisma,
  secret,
  suppressionSecret,
  baseURL,
  webOrigin,
  supportUrl: "https://fixture-links.dev/support",
};
const auth = createDeliveryAuth(config);
afterAll(() => prisma.$disconnect());
function call(path: string, body: unknown = {}, cookie = "", instance = auth) {
  return instance.handler(
    new Request(`${baseURL}/api/v1/auth${path}`, {
      method: "POST",
      headers: {
        origin: webOrigin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
const cookies = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
async function login(email: string, cookie = "", instance = auth, googleConnection = false) {
  // Advance only this fixture's resend cooldown; delivery tests cover that budget.
  await prisma.requestBudget.deleteMany({ where: { key: emailKey(secret, "issue-gap", email) } });
  expect((await call("/code/send", { email, googleConnection }, cookie, instance)).status).toBe(
    200,
  );
  const mail = await prisma.emailOutbox.findFirstOrThrow({
    where: { recipientKey: emailKey(suppressionSecret, "recipient", email) },
    orderBy: { createdAt: "desc" },
  });
  const code = unseal(mail.payload ?? "", secret).text.match(/^\d{8}$/m)?.[0];
  return call(
    "/code/verify",
    { email, code, name: "Security test", createAccount: true },
    cookie,
    instance,
  );
}
function totp(uri: string) {
  const raw = new URL(uri).searchParams.get("secret") ?? "";
  let bits = "";
  for (const char of raw.toUpperCase())
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)?.map((v) => parseInt(v, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[19] & 15;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
async function enrolled() {
  const email = `security-${randomUUID()}@example.com`;
  const signed = await login(email);
  expect(signed.status).toBe(200);
  const user = (await signed.clone().json()).user;
  const lastLoginAt = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt;
  const initial = cookies(signed);
  const start = await call("/security/totp/start", {}, initial);
  expect(start.status).toBe(200);
  const setup = await start.json();
  const confirmed = await call("/security/totp/confirm", { code: totp(setup.totpURI) }, initial);
  expect(confirmed.status).toBe(200);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt).toEqual(
    lastLoginAt,
  );
  const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
  expect(session.authenticationMethod).toBe("email");
  expect(session.verifiedAt).toEqual(lastLoginAt);
  return { email, user, setup, cookie: cookies(confirmed) || initial, initial };
}
describe("passwordless protection", () => {
  it("enrolls TOTP after an abandoned Google connection without completing a login", async () => {
    const email = `abandoned-google-totp-${randomUUID()}@example.com`;
    const signed = await login(email);
    expect(signed.status).toBe(200);
    const user = (await signed.json()).user;
    const original = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    const token = await stageGoogleConnection(prisma, secret, { subject: randomUUID(), email });
    expect(token).not.toBeNull();
    const cookie = `${cookies(signed)}; ${googleConnectionCookie(baseURL)}=${token}`;
    const start = await call("/security/totp/start", {}, cookie);
    expect(start.status).toBe(200);
    expect(
      await prisma.verification.count({
        where: { identifier: { startsWith: `google-connect:${user.id}:` } },
      }),
    ).toBe(0);
    const setup = await start.json();
    const code = totp(setup.totpURI);
    const confirmed = await call("/security/totp/confirm", { code }, cookie);
    expect(confirmed.status).toBe(200);
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.twoFactorEnabled).toBe(true);
    expect(updatedUser.lastLoginAt).toEqual(original.verifiedAt);
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: cookies(confirmed) }),
    });
    expect(session?.user.id).toBe(user.id);
    const rotated = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(rotated.id).not.toBe(original.id);
    expect(rotated.authenticationMethod).toBe(original.authenticationMethod);
    expect(rotated.verifiedAt).toEqual(original.verifiedAt);
    expect(await prisma.account.count({ where: { userId: user.id, providerId: "google" } })).toBe(
      0,
    );
    await expectSignIns(prisma, user.id, ["email"]);
    const pending = await login(email);
    expect((await pending.clone().json()).twoFactorRedirect).toBe(true);
    expect((await call("/two-factor/verify-totp", { code }, cookies(pending))).status).toBe(401);
  });
  it("requires factor confirmation, prevents replacement, and gates email before any usable session", async () => {
    const owner = await enrolled();
    await expectSignIns(prisma, owner.user.id, ["email"]);
    expect((await call("/security/totp/start", {}, owner.cookie)).status).toBe(409);
    const pending = await login(owner.email);
    expect(pending.status).toBe(200);
    expect((await pending.clone().json()).twoFactorRedirect).toBe(true);
    await expectSignIns(prisma, owner.user.id, ["email"]);
    expect(pending.headers.get("set-auth-token")).toBeNull();
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: cookies(pending) }) }),
    ).toBeNull();
    const recovered = await call(
      "/two-factor/verify-backup-code",
      { code: owner.setup.backupCodes[0] },
      cookies(pending),
    );
    expect(recovered.status).toBe(200);
    await expectSignIns(prisma, owner.user.id, ["email", "recovery"]);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: cookies(recovered) }) }),
    ).not.toBeNull();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).twoFactorEnabled,
    ).toBe(true);
    const replay = await call(
      "/two-factor/verify-backup-code",
      { code: owner.setup.backupCodes[0] },
      cookies(pending),
    );
    expect(replay.ok).toBe(false);
    await expectSignIns(prisma, owner.user.id, ["email", "recovery"]);
  });
  it("rejects raw bypasses, stale enrollment and unsafe origins", async () => {
    const email = `security-${randomUUID()}@example.com`;
    const signed = await login(email);
    const cookie = cookies(signed);
    const user = (await signed.json()).user;
    for (const path of [
      "/two-factor/enable",
      "/two-factor/disable",
      "/two-factor/get-totp-uri",
      "/two-factor/generate-backup-codes",
      "/passkey/verify-registration",
      "/sign-in/email-otp",
      "/sign-up/email",
    ])
      expect((await call(path, {}, cookie)).status).toBe(404);
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { verifiedAt: new Date(0) },
    });
    expect((await call("/security/totp/start", {}, cookie)).status).toBe(403);
    const cross = await auth.handler(
      new Request(`${baseURL}/api/v1/auth/security/totp/start`, {
        method: "POST",
        headers: { origin: "https://foreign.invalid", cookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(cross.status).toBe(403);
  });
  it("does not let an old authenticated session substitute for a pending factor", async () => {
    const owner = await enrolled();
    const response = await call(
      "/two-factor/verify-backup-code",
      { code: owner.setup.backupCodes[0] },
      owner.cookie,
    );
    expect(response.ok).toBe(false);
  });
  it("rejects a pending login after suspension and keeps recovery attempts single-use", async () => {
    const owner = await enrolled();
    const pending = await login(owner.email);
    await prisma.user.update({ where: { id: owner.user.id }, data: { accountState: "inactive" } });
    const blocked = await call(
      "/two-factor/verify-backup-code",
      { code: owner.setup.backupCodes[0] },
      cookies(pending),
    );
    expect(blocked.status).toBe(401);
    expect(blocked.headers.get("set-cookie")).toBeNull();
  });
});

it("consumes recovery once across concurrent challenges and preserves it on rollback", async () => {
  const owner = await enrolled();
  const first = cookies(await login(owner.email));
  const second = cookies(await login(owner.email));
  const responses = await Promise.all(
    [first, second].map((cookie) =>
      call("/two-factor/verify-backup-code", { code: owner.setup.backupCodes[0] }, cookie),
    ),
  );
  expect(responses.filter((response) => response.ok)).toHaveLength(1);
  expect(await prisma.session.count({ where: { userId: owner.user.id } })).toBe(2);
  const pending = cookies(await login(owner.email));
  const broken = createDeliveryAuth({
    ...config,
    beforeCommit: async () => {
      throw new Error("synthetic rollback");
    },
  });
  const rejected = await call(
    "/two-factor/verify-backup-code",
    { code: owner.setup.backupCodes[1] },
    pending,
    broken,
  );
  expect(rejected.status).toBe(503);
  expect(rejected.headers.get("set-cookie")).toBeNull();
  expect(
    (await call("/two-factor/verify-backup-code", { code: owner.setup.backupCodes[1] }, pending))
      .status,
  ).toBe(200);
});

it("rejects TOTP replay, expired challenges and exhausted factor attempts", async () => {
  const owner = await enrolled();
  // Permit the setup time-step in this fixture, then prove sign-in replay is denied.
  await prisma.verification.deleteMany({
    where: { identifier: { startsWith: `totp-used:${owner.user.id}:` } },
  });
  const pending = cookies(await login(owner.email));
  const code = totp(owner.setup.totpURI);
  const complete = await call("/two-factor/verify-totp", { code }, pending);
  expect(complete.status).toBe(200);
  await expectSignIns(prisma, owner.user.id, ["email", "totp"]);
  const another = cookies(await login(owner.email));
  const replay = await call("/two-factor/verify-totp", { code }, another);
  expect(replay.ok).toBe(false);
  expect(replay.headers.get("set-cookie")).toBeNull();
  await expectSignIns(prisma, owner.user.id, ["email", "totp"]);
  await prisma.verification.updateMany({
    where: { value: owner.user.id, identifier: { startsWith: "2fa-" } },
    data: { expiresAt: new Date(0) },
  });
  expect(
    (await call("/two-factor/verify-backup-code", { code: owner.setup.backupCodes[0] }, another))
      .ok,
  ).toBe(false);
  const bounded = cookies(await login(owner.email));
  for (let i = 0; i < 5; i++)
    expect(
      (await call("/two-factor/verify-backup-code", { code: "wrong-wrong" }, bounded)).ok,
    ).toBe(false);
  expect(
    (await call("/two-factor/verify-backup-code", { code: owner.setup.backupCodes[0] }, bounded))
      .ok,
  ).toBe(false);
});

it("grants an invitation role only after the enrolled factor, and rejects cancelled invitations", async () => {
  const admin = (await (await login(`admin-${randomUUID()}@example.com`)).json()).user;
  await prisma.adminGrant.create({ data: { userId: admin.id, invitationId: randomUUID() } });
  for (const cancel of [false, true]) {
    const owner = await enrolled();
    const token = randomBytes(32).toString("base64url");
    const invitation = await prisma.serviceInvitation.create({
      data: {
        tokenHash: invitationDigest(token),
        role: "operator",
        email: owner.email,
        invitedById: admin.id,
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    const abandoned = await stageGoogleConnection(prisma, secret, {
      email: admin.email,
      subject: randomUUID(),
    });
    const accepted = await call(
      "/invitations/accept",
      {
        token,
        version: invitation.version,
        operationId: randomUUID(),
        action: "accept",
      },
      `${googleConnectionCookie(baseURL)}=${abandoned}`,
    );
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get("set-cookie")).toContain("google_connection=;");
    expect(
      await prisma.verification.count({
        where: { identifier: { startsWith: `google-connect:${admin.id}:` } },
      }),
    ).toBe(0);
    // Resuming an invitation must also discard a newly abandoned connection.
    const nextAbandoned = await stageGoogleConnection(prisma, secret, {
      email: admin.email,
      subject: randomUUID(),
    });
    const resumed = await call(
      "/invitations/resend",
      { token },
      `${googleConnectionCookie(baseURL)}=${nextAbandoned}`,
    );
    expect(resumed.status).toBe(200);
    expect(resumed.headers.get("set-cookie")).toContain("google_connection=;");
    const mail = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipientKey: emailKey(suppressionSecret, "recipient", owner.email) },
      orderBy: { createdAt: "desc" },
    });
    const code = unseal(mail.payload ?? "", secret).text.match(/^\d{8}$/m)?.[0];
    const pending = await call("/invitations/verify", { token, code });
    expect(pending.status).toBe(200);
    expect((await pending.clone().json()).twoFactorRedirect).toBe(true);
    expect(await prisma.operatorGrant.count({ where: { userId: owner.user.id } })).toBe(0);
    await expectSignIns(prisma, owner.user.id, ["email"]);
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie: cookies(pending) }) }),
    ).toBeNull();
    if (cancel)
      await prisma.serviceInvitation.update({
        where: { id: invitation.id },
        data: { state: "cancelled", version: { increment: 1 } },
      });
    const finish = await call(
      "/two-factor/verify-backup-code",
      { code: owner.setup.backupCodes[0] },
      cookies(pending),
    );
    expect(finish.ok).toBe(!cancel);
    expect(await prisma.operatorGrant.count({ where: { userId: owner.user.id } })).toBe(
      cancel ? 0 : 1,
    );
    if (cancel) expect(finish.headers.get("set-cookie")).toBeNull();
    await expectSignIns(prisma, owner.user.id, cancel ? ["email"] : ["email", "recovery"]);
  }
});

it("Google requires explicit creation consent, links authoritative email, and gates enrolled factors", async () => {
  const instance = createDeliveryAuth({
    ...config,
    google: { clientId: "synthetic-google-client", clientSecret: "synthetic-google-secret" },
  });
  const originalFetch = globalThis.fetch;
  let profile: Record<string, unknown> = {};
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url !== "https://oauth2.googleapis.com/token")
        throw new Error("Unexpected provider request in isolated test");
      const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      return Response.json({
        access_token: "synthetic-access",
        token_type: "Bearer",
        expires_in: 3600,
        id_token: `${part({ alg: "none" })}.${part(profile)}.synthetic`,
      });
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch;
  async function callback(cookie = "", link = false) {
    const start = await call(
      link ? "/link-social" : "/sign-in/social",
      { provider: "google" },
      cookie,
      instance,
    );
    expect(start.status).toBe(200);
    const url = new URL((await start.json()).url);
    expect(url.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/v1/auth/callback/google`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const state = url.searchParams.get("state");
    const response = await instance.handler(
      new Request(`${baseURL}/api/v1/auth/callback/google?state=${state}&code=synthetic-code`, {
        headers: { cookie: [cookie, cookies(start)].filter(Boolean).join("; ") },
      }),
    );
    return { response, state, cookie: cookies(start) };
  }
  try {
    const unknown = `new-${randomUUID()}@gmail.com`;
    profile = { sub: randomUUID(), email: unknown, email_verified: true, name: "Google fixture" };
    const missing = (await callback()).response;
    expect(missing.headers.get("location")).toBe(`${webOrigin}/sign-in/google`);
    const registrationCookie = cookies(missing);
    const registration = await instance.handler(
      new Request(`${baseURL}/api/v1/auth/google-connection`, {
        headers: { cookie: registrationCookie },
      }),
    );
    expect((await registration.json()).data).toEqual({ email: unknown, registration: true });
    expect(
      await instance.api.getSession({ headers: new Headers({ cookie: registrationCookie }) }),
    ).toBeNull();
    expect(
      (
        await call(
          "/code/verify",
          { email: unknown, code: "00000000" },
          registrationCookie,
          instance,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await call(
          "/passkey/generate-authenticate-options",
          { googleConnection: true },
          registrationCookie,
          instance,
        )
      ).ok,
    ).toBe(false);
    expect(await prisma.user.findUnique({ where: { email: unknown } })).toBeNull();
    expect(
      (await call("/sign-in/social", { provider: "google", requestSignUp: true }, "", instance))
        .status,
    ).toBe(400);
    expect(
      (
        await call(
          "/sign-in/social",
          { provider: "google", idToken: { token: "forged" } },
          "",
          instance,
        )
      ).status,
    ).toBe(400);
    for (const body of [{}, { confirm: false }, { confirm: true, email: "forged@example.com" }])
      expect(
        (await call("/google-connection/register", body, registrationCookie, instance)).status,
      ).toBe(400);
    expect(
      (await call("/google-connection/register", { confirm: true }, "", instance)).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/code/send",
          { email: unknown, googleConnection: true },
          registrationCookie,
          instance,
        )
      ).status,
    ).toBe(400);
    const brokenRegistration = createDeliveryAuth({
      ...config,
      google: { clientId: "synthetic-google-client", clientSecret: "synthetic-google-secret" },
      beforeCommit: async () => {
        throw new Error("onboarding rollback");
      },
    });
    const rolledBack = await call(
      "/google-connection/register",
      { confirm: true },
      registrationCookie,
      brokenRegistration,
    );
    expect(rolledBack.status).toBe(503);
    expect(rolledBack.headers.get("set-cookie")).toBeNull();
    expect(await prisma.user.findUnique({ where: { email: unknown } })).toBeNull();
    const registered = await call(
      "/google-connection/register",
      { confirm: true, hubName: "My Google hub" },
      registrationCookie,
      instance,
    );
    expect(registered.status).toBe(200);
    const newUser = (await registered.json()).user;
    await expectSignIns(prisma, newUser.id, ["google"]);
    expect(newUser.emailVerified).toBe(true);
    expect(newUser.name).toBe("Google fixture");
    expect(newUser.username).toBeTruthy();
    const signupHub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: newUser.id } });
    expect(signupHub.name).toBe("My Google hub");
    expect(signupHub.handle).toBe(newUser.username);
    expect(
      await prisma.emailOutbox.count({
        where: { recipientKey: emailKey(suppressionSecret, "recipient", unknown) },
      }),
    ).toBe(0);
    expect(
      await prisma.account.count({
        where: { userId: newUser.id, providerId: "google", accountId: profile.sub as string },
      }),
    ).toBe(1);
    const registeredSession = await instance.api.getSession({
      headers: new Headers({ cookie: cookies(registered) }),
    });
    expect(registeredSession?.user.id).toBe(newUser.id);
    expect(
      await prisma.session.findFirst({
        where: { userId: newUser.id, authenticationMethod: "google", verifiedAt: { not: null } },
      }),
    ).not.toBeNull();
    expect(
      (await call("/google-connection/register", { confirm: true }, registrationCookie, instance))
        .status,
    ).toBe(400);
    // Stale/cancelled consent and a competing email registration never create or attach an account.
    for (const state of ["cancelled", "expired", "registered", "subject-conflict"]) {
      const candidate = {
        subject: randomUUID(),
        email: `consent-${randomUUID()}@example.com`,
        name: "Google name",
      };
      const token = await stageGoogleConnection(prisma, secret, candidate);
      if (!token) throw new Error("Missing staged registration");
      const cookie = `${googleConnectionCookie(baseURL)}=${token}`;
      if (state === "cancelled") await call("/google-connection/cancel", {}, cookie, instance);
      if (state === "expired")
        await prisma.verification.updateMany({
          where: { identifier: { startsWith: `google-connect:${token.slice(0, 36)}:` } },
          data: { expiresAt: new Date(0) },
        });
      if (state === "registered") await login(candidate.email);
      if (state === "subject-conflict")
        await prisma.account.create({
          data: { userId: newUser.id, providerId: "google", accountId: candidate.subject },
        });
      expect(
        (await call("/google-connection/register", { confirm: true }, cookie, instance)).status,
      ).toBe(400);
      expect(await prisma.user.count({ where: { email: candidate.email } })).toBe(
        state === "registered" ? 1 : 0,
      );
    }
    const email = `google-${randomUUID()}@gmail.com`;
    const signed = await login(email);
    const user = (await signed.clone().json()).user;
    profile = { sub: randomUUID(), email, email_verified: true, name: "Google fixture" };
    const completed = await callback();
    expect(completed.response.status).toBe(302);
    await expectSignIns(prisma, user.id, ["email", "google"]);
    expect(completed.response.headers.get("location")).toBe(`${webOrigin}/sign-in/complete`);
    expect(
      await instance.api.getSession({
        headers: new Headers({ cookie: cookies(completed.response) }),
      }),
    ).not.toBeNull();
    const replay = await instance.handler(
      new Request(
        `${baseURL}/api/v1/auth/callback/google?state=${completed.state}&code=synthetic-code`,
        { headers: { cookie: completed.cookie } },
      ),
    );
    expect(replay.headers.get("location")).toContain("error=");
    const originalGoogleEmail = profile.email;
    const changedGoogleEmail = `changed-google-${randomUUID()}@gmail.com`;
    profile.email = changedGoogleEmail;
    const sessionsBeforeMismatch = await prisma.session.count({ where: { userId: user.id } });
    const mismatched = (await callback()).response;
    expect(mismatched.headers.get("location")).toBe(
      `${webOrigin}/sign-in?notice=google-email-mismatch`,
    );
    expect(mismatched.headers.get("set-cookie")).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(sessionsBeforeMismatch);
    expect(await prisma.user.findUnique({ where: { email: changedGoogleEmail } })).toBeNull();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(email);
    profile.email = originalGoogleEmail;
    const start = await call("/security/totp/start", {}, cookies(completed.response));
    const setup = await start.json();
    const confirmed = await call(
      "/security/totp/confirm",
      { code: totp(setup.totpURI) },
      cookies(completed.response),
    );
    expect(confirmed.status).toBe(200);
    const pending = (await callback()).response;

    expect(
      await instance.api.getSession({ headers: new Headers({ cookie: cookies(pending) }) }),
    ).toBeNull();
    expect(pending.headers.get("location")).toBe(`${webOrigin}/sign-in/factor`);
    await expectSignIns(prisma, user.id, ["email", "google"]);
    const finish = await call(
      "/two-factor/verify-backup-code",
      { code: setup.backupCodes[0] },
      cookies(pending),
      instance,
    );
    expect(finish.status).toBe(200);
    expect((await finish.json()).user.id).toBe(user.id);
    await expectSignIns(prisma, user.id, ["email", "google", "recovery"]);
    const external = `external-${randomUUID()}@example.com`;
    const extSession = await login(external);
    profile = {
      sub: randomUUID(),
      email: external,
      email_verified: true,
      name: "External Google fixture",
    };
    const firstConnection = (await callback()).response;
    expect(firstConnection.headers.get("location")).toBe(`${webOrigin}/sign-in/google`);
    const connectionCookie = cookies(firstConnection);
    const extUserId = (await extSession.clone().json()).user.id;
    const connectedCount = () =>
      prisma.account.count({ where: { userId: extUserId, providerId: "google" } });
    expect(await connectedCount()).toBe(0);
    expect(
      await instance.api.getSession({ headers: new Headers({ cookie: connectionCookie }) }),
    ).toBeNull();
    const preview = await instance.handler(
      new Request(`${baseURL}/api/v1/auth/google-connection`, {
        headers: { cookie: connectionCookie },
      }),
    );
    expect(await preview.json()).toEqual({ data: { email: external, registration: false } });
    const wrongEmail = `wrong-${randomUUID()}@example.com`;
    expect(
      (
        await call(
          "/code/send",
          { email: wrongEmail, googleConnection: true },
          connectionCookie,
          instance,
        )
      ).status,
    ).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: wrongEmail } })).toBeNull();
    // A pre-existing session is not completion: the email proof must actually run.
    expect(
      (
        await call(
          "/code/verify",
          { email: external, code: "00000000" },
          [connectionCookie, cookies(extSession)].join("; "),
          instance,
        )
      ).ok,
    ).toBe(false);
    expect(await connectedCount()).toBe(0);
    const broken = createDeliveryAuth({
      ...config,
      beforeCommit: async () => {
        throw new Error("synthetic rollback");
      },
    });
    await prisma.requestBudget.deleteMany({
      where: { key: emailKey(secret, "issue-gap", external) },
    });
    expect(
      (
        await call(
          "/code/send",
          { email: external, googleConnection: true },
          connectionCookie,
          instance,
        )
      ).status,
    ).toBe(200);
    const rollbackMail = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipientKey: emailKey(suppressionSecret, "recipient", external) },
      orderBy: { createdAt: "desc" },
    });
    const rollbackCode = unseal(rollbackMail.payload ?? "", secret).text.match(/^\d{8}$/m)?.[0];
    const rollback = await call(
      "/code/verify",
      { email: external, code: rollbackCode },
      connectionCookie,
      broken,
    );
    expect(rollback.status).toBe(503);
    expect(rollback.headers.get("set-cookie")).toBeNull();
    expect(await connectedCount()).toBe(0);
    const proof = await login(external, connectionCookie, instance, true);
    expect(proof.status).toBe(200);
    expect(await connectedCount()).toBe(1);
    expect(proof.headers.get("set-cookie")).toContain("better-auth.google_connection=;");
    expect(
      (
        await instance.handler(
          new Request(`${baseURL}/api/v1/auth/google-connection`, {
            headers: { cookie: connectionCookie },
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/code/verify",
          { email: external, code: "00000000" },
          connectionCookie,
          instance,
        )
      ).ok,
    ).toBe(false);
    expect((await callback()).response.headers.get("location")).toBe(
      `${webOrigin}/sign-in/complete`,
    );
    const protectedOwner = await enrolled();
    profile = { sub: randomUUID(), email: protectedOwner.email, email_verified: true };
    const protectedConnection = cookies((await callback()).response);
    const emailProof = await login(protectedOwner.email, protectedConnection, instance, true);
    expect((await emailProof.clone().json()).twoFactorRedirect).toBe(true);
    expect(
      await prisma.account.count({
        where: { userId: protectedOwner.user.id, providerId: "google" },
      }),
    ).toBe(0);
    const factorCookies = [protectedConnection, cookies(emailProof)].join("; ");
    expect(
      (
        await call(
          "/two-factor/verify-backup-code",
          { code: "wrong-wrong" },
          factorCookies,
          instance,
        )
      ).ok,
    ).toBe(false);
    expect(
      await prisma.account.count({
        where: { userId: protectedOwner.user.id, providerId: "google" },
      }),
    ).toBe(0);
    const protectedComplete = await call(
      "/two-factor/verify-backup-code",
      { code: protectedOwner.setup.backupCodes[0] },
      factorCookies,
      instance,
    );
    expect(protectedComplete.status).toBe(200);
    expect(
      await prisma.account.count({
        where: { userId: protectedOwner.user.id, providerId: "google" },
      }),
    ).toBe(1);
    expect((await callback()).response.headers.get("location")).toBe(`${webOrigin}/sign-in/factor`);

    for (const invalidation of ["expired", "version", "email", "inactive", "cancel"] as const) {
      const address = `stale-${randomUUID()}@example.com`;
      const owner = (await (await login(address)).json()).user;
      profile = { sub: randomUUID(), email: address, email_verified: true };
      const staged = cookies((await callback()).response);
      if (invalidation === "expired")
        await prisma.verification.updateMany({
          where: { identifier: { startsWith: `google-connect:${owner.id}:` } },
          data: { expiresAt: new Date(0) },
        });
      if (invalidation === "version")
        await prisma.user.update({
          where: { id: owner.id },
          data: { operationsVersion: { increment: 1 } },
        });
      if (invalidation === "email")
        await prisma.user.update({
          where: { id: owner.id },
          data: { email: `changed-${randomUUID()}@example.com` },
        });
      if (invalidation === "inactive")
        await prisma.user.update({ where: { id: owner.id }, data: { accountState: "inactive" } });
      if (invalidation === "cancel")
        expect((await call("/google-connection/cancel", {}, staged, instance)).ok).toBe(true);
      expect(
        (await call("/code/send", { email: address, googleConnection: true }, staged, instance)).ok,
      ).toBe(false);
      expect(
        await prisma.account.count({ where: { userId: owner.id, providerId: "google" } }),
      ).toBe(0);
    }
    profile = { sub: randomUUID(), email: external, email_verified: false };
    expect((await callback()).response.headers.get("location")).toContain("error=");
    const noState = await instance.handler(
      new Request(`${baseURL}/api/v1/auth/callback/google?state=forged&code=synthetic-code`),
    );
    expect(noState.headers.get("location")).toContain("error=");
    expect(noState.headers.get("set-cookie") ?? "").not.toContain("google_connection=");
    profile = {
      sub: randomUUID(),
      email: `different-link-${randomUUID()}@gmail.com`,
      email_verified: true,
    };
    const wrongLink = await call(
      "/link-social",
      { provider: "google" },
      cookies(extSession),
      instance,
    );
    const wrongLinkState = new URL((await wrongLink.json()).url).searchParams.get("state");
    const wrongLinkResponse = await instance.handler(
      new Request(
        `${baseURL}/api/v1/auth/callback/google?state=${wrongLinkState}&code=synthetic-code`,
        { headers: { cookie: [cookies(extSession), cookies(wrongLink)].join("; ") } },
      ),
    );
    expect(wrongLinkResponse.headers.get("location")).toBe(
      `${webOrigin}/sign-in?notice=google-email-mismatch`,
    );
    expect(wrongLinkResponse.headers.get("set-cookie")).toBeNull();
    expect(
      await prisma.account.count({
        where: { providerId: "google", accountId: profile.sub as string },
      }),
    ).toBe(0);
    profile = { sub: randomUUID(), email: external, email_verified: true };
    const linking = await call(
      "/link-social",
      { provider: "google" },
      cookies(extSession),
      instance,
    );
    const linkingState = new URL((await linking.json()).url).searchParams.get("state");
    const extUser = (await extSession.clone().json()).user;
    await prisma.session.deleteMany({ where: { userId: extUser.id } });
    const revokedLink = await instance.handler(
      new Request(
        `${baseURL}/api/v1/auth/callback/google?state=${linkingState}&code=synthetic-code`,
        {
          headers: { cookie: [cookies(extSession), cookies(linking)].join("; ") },
        },
      ),
    );
    expect(revokedLink.status).toBe(403);
    expect(revokedLink.headers.get("set-cookie")).toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

it("discards abandoned Google connections for ordinary email and standalone passkey starts", async () => {
  const emailA = `abandoned-google-${randomUUID()}@example.com`;
  const emailB = `switch-account-${randomUUID()}@example.com`;
  const userA = (await (await login(emailA)).json()).user;
  const userB = (await (await login(emailB)).json()).user;
  for (const method of ["email", "passkey", "identify", "confirmation"] as const) {
    const token = await stageGoogleConnection(prisma, secret, {
      subject: randomUUID(),
      email: emailA,
    });
    const cookie = `${googleConnectionCookie(baseURL)}=${token}`;
    const pendingCount = () =>
      prisma.verification.count({
        where: { identifier: { startsWith: `google-connect:${userA.id}:` } },
      });
    expect(
      (await call("/code/send", { email: emailB, googleConnection: true }, cookie)).status,
    ).toBe(400);
    expect(await pendingCount()).toBe(1);
    // Passkey factor continuation must not silently cancel the Google flow.
    expect(
      (await call("/passkey/generate-authenticate-options", { continueSignIn: true }, cookie)).ok,
    ).toBe(true);
    expect(await pendingCount()).toBe(1);
    await prisma.requestBudget.deleteMany({
      where: {
        key: { in: [emailKey(secret, "issue-gap", emailB), emailKey(secret, "issue", emailB)] },
      },
    });
    const path =
      method === "identify"
        ? "/sign-in/identify"
        : method === "passkey"
          ? "/passkey/generate-authenticate-options"
          : "/code/send";
    const body =
      method === "passkey"
        ? {}
        : { email: emailB, ...(method === "confirmation" ? { purpose: "confirm" } : {}) };
    const broken = createDeliveryAuth({
      ...config,
      beforeCommit: async () => {
        throw new Error("restart rollback");
      },
    });
    const rollback = await call(path, body, cookie, broken);
    expect(rollback.status).toBe(503);
    expect(rollback.headers.get("set-cookie")).toBeNull();
    expect(await pendingCount()).toBe(1);
    const started = await call(path, body, cookie);
    expect(started.ok).toBe(true);
    expect(started.headers.get("set-cookie")).toContain("better-auth.google_connection=;");
    expect(await pendingCount()).toBe(0);
    const signed = await login(emailB);
    expect(signed.ok).toBe(true);
    expect((await signed.json()).user.id).toBe(userB.id);
    expect(
      await prisma.account.count({
        where: { userId: { in: [userA.id, userB.id] }, providerId: "google" },
      }),
    ).toBe(0);
    expect((await call("/code/verify", { email: emailA, code: "00000000" }, cookie)).ok).toBe(
      false,
    );
  }
});
