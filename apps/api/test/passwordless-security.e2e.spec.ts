import { afterAll, describe, expect, it } from "bun:test";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { createDeliveryAuth } from "../src/auth/delivery-auth";
import { emailKey, unseal } from "../src/email/outbox";
import { PrismaClient } from "../src/generated/prisma/client";
import { invitationDigest } from "../src/operations/invitations";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const secret = "security-test-only-secret-independent-32";
const suppressionSecret = "security-test-only-suppression-independent";
const baseURL = "http://localhost:4000";
const config = {
  prisma,
  secret,
  suppressionSecret,
  baseURL,
  supportUrl: "https://fixture-links.dev/support",
};
const auth = createDeliveryAuth(config);
afterAll(() => prisma.$disconnect());
function call(path: string, body: unknown = {}, cookie = "", instance = auth) {
  return instance.handler(
    new Request(`${baseURL}/api/v1/auth${path}`, {
      method: "POST",
      headers: {
        origin: baseURL,
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
async function login(email: string) {
  // Advance only this fixture's resend cooldown; delivery tests cover that budget.
  await prisma.requestBudget.deleteMany({ where: { key: emailKey(secret, "issue-gap", email) } });
  expect((await call("/code/send", { email })).status).toBe(200);
  const mail = await prisma.emailOutbox.findFirstOrThrow({
    where: { recipientKey: emailKey(suppressionSecret, "recipient", email) },
    orderBy: { createdAt: "desc" },
  });
  const code = unseal(mail.payload ?? "", secret).text.match(/^\d{8}$/m)?.[0];
  return call("/code/verify", { email, code, name: "Security test" });
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
  const initial = cookies(signed);
  const start = await call("/security/totp/start", {}, initial);
  expect(start.status).toBe(200);
  const setup = await start.json();
  const confirmed = await call("/security/totp/confirm", { code: totp(setup.totpURI) }, initial);
  expect(confirmed.status).toBe(200);
  return { email, user, setup, cookie: cookies(confirmed) || initial, initial };
}
describe("passwordless protection", () => {
  it("requires factor confirmation, prevents replacement, and gates email before any usable session", async () => {
    const owner = await enrolled();
    expect((await call("/security/totp/start", {}, owner.cookie)).status).toBe(409);
    const pending = await login(owner.email);
    expect(pending.status).toBe(200);
    expect((await pending.clone().json()).twoFactorRedirect).toBe(true);
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
  const another = cookies(await login(owner.email));
  const replay = await call("/two-factor/verify-totp", { code }, another);
  expect(replay.ok).toBe(false);
  expect(replay.headers.get("set-cookie")).toBeNull();
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
    expect(
      (
        await call("/invitations/accept", {
          token,
          version: invitation.version,
          operationId: randomUUID(),
          action: "accept",
        })
      ).status,
    ).toBe(200);
    const mail = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipientKey: emailKey(suppressionSecret, "recipient", owner.email) },
      orderBy: { createdAt: "desc" },
    });
    const code = unseal(mail.payload ?? "", secret).text.match(/^\d{8}$/m)?.[0];
    const pending = await call("/invitations/verify", { token, code });
    expect(pending.status).toBe(200);
    expect((await pending.clone().json()).twoFactorRedirect).toBe(true);
    expect(await prisma.operatorGrant.count({ where: { userId: owner.user.id } })).toBe(0);
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
  }
});

it("Google is existing-account only, links authoritative email, and gates enrolled factors", async () => {
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
    expect(missing.headers.get("location")).toContain("error=signup");
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
    const email = `google-${randomUUID()}@gmail.com`;
    const signed = await login(email);
    const user = (await signed.clone().json()).user;
    profile = { sub: randomUUID(), email, email_verified: true, name: "Google fixture" };
    const completed = await callback();
    expect(completed.response.status).toBe(302);
    expect(completed.response.headers.get("location")).toBe(`${baseURL}/sign-in/complete`);
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
    expect(pending.headers.get("location")).toBe(`${baseURL}/sign-in/factor`);
    const finish = await call(
      "/two-factor/verify-backup-code",
      { code: setup.backupCodes[0] },
      cookies(pending),
      instance,
    );
    expect(finish.status).toBe(200);
    expect((await finish.json()).user.id).toBe(user.id);
    const external = `external-${randomUUID()}@example.com`;
    const extSession = await login(external);
    profile = {
      sub: randomUUID(),
      email: external,
      email_verified: true,
      name: "External Google fixture",
    };
    expect((await callback()).response.headers.get("location")).toContain("error=");
    expect((await callback(cookies(extSession))).response.headers.get("location")).toContain(
      "error=",
    );
    expect((await callback(cookies(extSession), true)).response.headers.get("location")).toContain(
      "/settings/security",
    );
    expect((await callback()).response.headers.get("location")).toBe(`${baseURL}/sign-in/complete`);
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
