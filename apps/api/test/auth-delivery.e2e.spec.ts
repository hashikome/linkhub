import { afterAll, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { signInCodePurposes } from "@ntumie/types";
import { PrismaPg } from "@prisma/adapter-pg";
import { CODE_RESEND_SECONDS, createDeliveryAuth } from "../src/auth/delivery-auth";
import { emailKey, unseal } from "../src/email/outbox";
import { PrismaClient } from "../src/generated/prisma/client";
import { expectSignIns } from "./fixtures/authentication-audit";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const suppressionSecret = "test-auth-suppression-secret-independent";
const secret = "test-auth-delivery-secret-unique-32-characters";
const config = {
  prisma,
  secret,
  suppressionSecret,
  baseURL: "http://localhost:4004",
  supportUrl: "https://fixture-links.dev/support",
};
const auth = createDeliveryAuth(config);
const address = () => `delivery-${randomUUID()}@example.com`;
function call(path: string, body: unknown = {}, token?: string, instance = auth) {
  return instance.handler(
    new Request(`http://localhost:4004/api/v1/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:4004",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}
async function code(to: string) {
  const rows = await prisma.emailOutbox.findMany({
    where: { recipientKey: emailKey(suppressionSecret, "recipient", to), state: "pending" },
    orderBy: { createdAt: "desc" },
    take: 1,
  });
  const payload = unseal(rows[0].payload ?? "", secret);
  // The target address can contain numeric segments before the
  // actual code. The template puts the proof on its own line.
  return payload.text.match(/^\d{6}$/m)?.[0] ?? "";
}
// Simulates the resend gap passing without waiting in real time.
async function elapseResendGap(email: string) {
  await prisma.$executeRaw`UPDATE request_budgets SET expires_at = clock_timestamp() WHERE key = ${emailKey(secret, "issue-gap", email)}`;
}
async function signup(email = address()) {
  await call("/code/send", { email });
  const response = await call("/code/verify", {
    email,
    code: await code(email),
    name: "Delivery Test",
    createAccount: true,
  });
  expect(response.status).toBe(200);
  return {
    email,
    token: response.headers.get("set-auth-token") ?? "",
    user: (await response.json()).user,
  };
}
afterAll(async () => {
  await prisma.$disconnect();
});
describe("transactional codes-only auth", () => {
  it("uses the default six-digit proof while preserving expiry and single-use verification", async () => {
    const email = address();
    const started = Date.now();
    expect((await call("/code/send", { email })).status).toBe(200);
    const proof = await code(email);
    expect(proof).toMatch(/^\d{6}$/);
    const stored = await prisma.verification.findFirstOrThrow({
      where: { identifier: `sign-in-otp-${email}` },
    });
    expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(started + 300_000);
    expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 300_000);
    for (const malformed of [proof.slice(0, 5), `${proof}0`, `${proof}00`])
      expect((await call("/code/verify", { email, code: malformed })).status).toBe(400);
    const body = { email, code: proof, createAccount: true };
    expect((await call("/code/verify", body)).status).toBe(200);
    expect((await call("/code/verify", body)).ok).toBe(false);

    const expiredEmail = address();
    await call("/code/send", { email: expiredEmail });
    const expired = await code(expiredEmail);
    await prisma.verification.updateMany({
      where: { identifier: `sign-in-otp-${expiredEmail}` },
      data: { expiresAt: new Date(0) },
    });
    expect((await call("/code/verify", { email: expiredEmail, code: expired })).status).toBe(400);
  });

  it("retains the identity verification budget across replacement six-digit codes", async () => {
    const email = address();
    let latest = "";
    for (let issue = 0; issue < 5; issue++) {
      expect((await call("/code/send", { email })).status).toBe(200);
      latest = await code(email);
      expect(latest).toMatch(/^\d{6}$/);
      const wrong = latest === "000000" ? "111111" : "000000";
      for (let attempt = 0; attempt < 3; attempt++)
        expect((await call("/code/verify", { email, code: wrong })).status).toBe(400);
      await elapseResendGap(email);
    }
    expect((await call("/code/verify", { email, code: latest })).status).toBe(429);
    expect((await call("/code/send", { email })).status).toBe(429);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("records only committed successful logins, independently of session reads and expiry", async () => {
    const started = Date.now();
    const owner = await signup();
    await expectSignIns(prisma, owner.user.id, ["email"]);
    const read = async () =>
      (await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).lastLoginAt;
    expect((await read())?.getTime()).toBeGreaterThanOrEqual(started);
    const previous = new Date("2025-01-01T00:00:00Z");
    await prisma.user.update({ where: { id: owner.user.id }, data: { lastLoginAt: previous } });
    await auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${owner.token}` }) });
    expect(await read()).toEqual(previous);
    await call("/code/send", { email: owner.email });
    expect(await read()).toEqual(previous);
    const validCode = await code(owner.email);
    const wrongCode = validCode === "000000" ? "111111" : "000000";
    expect((await call("/code/verify", { email: owner.email, code: wrongCode })).ok).toBe(false);
    expect(await read()).toEqual(previous);
    const broken = createDeliveryAuth({
      ...config,
      beforeCommit: async () => {
        throw new Error("commit failure");
      },
    });
    expect(
      (await call("/code/verify", { email: owner.email, code: validCode }, undefined, broken))
        .status,
    ).toBe(503);
    expect(await read()).toEqual(previous);
    expect(await prisma.session.count({ where: { userId: owner.user.id } })).toBe(1);
    await expectSignIns(prisma, owner.user.id, ["email"]);
    expect((await call("/code/verify", { email: owner.email, code: validCode })).status).toBe(200);
    const recorded = await read();
    await expectSignIns(prisma, owner.user.id, ["email", "email"]);
    expect(recorded?.getTime()).toBeGreaterThanOrEqual(started);
    await prisma.session.deleteMany({ where: { userId: owner.user.id } });
    expect(await read()).toEqual(recorded);
  });

  it("persists purpose-specific copy on issue and resend without changing proof verification", async () => {
    const subjects = {
      "sign-in": "Your ntumie. sign-in code",
      "first-link": "Verify your email to save your first link · ntumie.",
      continue: "Your code to continue in ntumie.",
      resume: "Sign back in to ntumie.",
      confirm: "Confirm it's you · ntumie.",
    };
    for (const purpose of signInCodePurposes) {
      const email = address();
      for (const attempt of [0, 1]) {
        if (attempt) await elapseResendGap(email);
        expect((await call("/code/send", { email, purpose })).status).toBe(200);
        const row = await prisma.emailOutbox.findFirstOrThrow({
          where: {
            recipientKey: emailKey(suppressionSecret, "recipient", email),
            state: "pending",
          },
        });
        const payload = unseal(row.payload ?? "", secret);
        expect(payload.subject).toBe(subjects[purpose]);
        expect(payload.text).toContain("Do not share this code with anyone.");
      }
      expect((await call("/code/verify", { email, code: await code(email) })).status).toBe(200);
    }
    const email = address();
    for (const purpose of ["invitation", "unknown", null, {}, 1]) {
      expect((await call("/code/send", { email, purpose })).status).toBe(400);
    }
    expect(
      await prisma.emailOutbox.count({
        where: { recipientKey: emailKey(suppressionSecret, "recipient", email) },
      }),
    ).toBe(0);
    expect((await call("/code/send", { email })).status).toBe(200);
    const row = await prisma.emailOutbox.findFirstOrThrow({
      where: { recipientKey: emailKey(suppressionSecret, "recipient", email), state: "pending" },
    });
    expect(unseal(row.payload ?? "", secret).subject).toBe(subjects["sign-in"]);
  });

  it("honors shared auth budgets in production over the configured HTTP stack", async () => {
    // A fresh non-test process ensures better-auth reads production mode before
    // imports; changing NODE_ENV inside this test process would miss the bug.
    const child = Bun.spawn(["bun", resolve(__dirname, "fixtures/production-auth-budgets.ts")], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL_FILE: "",
        BETTER_AUTH_SECRET: "production-budget-test-secret-only-32-characters",
        BETTER_AUTH_SECRET_FILE: "",
        BETTER_AUTH_URL: "http://localhost:4004",
        EMAIL_PROVIDER: "capture",
        EMAIL_SUPPRESSION_SECRET: suppressionSecret,
        EMAIL_SUPPRESSION_SECRET_FILE: "",
        EMAIL_SUPPORT_URL: "https://fixture-links.dev/support",
        QUEUE_NAMESPACE: `test-budget-${randomUUID()}`,
        SENTRY_DSN: "",
        SENTRY_DSN_FILE: "",
        TRUSTED_PROXY_CIDRS: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const deadline = setTimeout(() => child.kill("SIGKILL"), 20_000);
    try {
      const [status, diagnostics] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
        new Response(child.stdout).text(),
      ]);
      expect(diagnostics).toBe("");
      expect(status).toBe(0);
    } finally {
      clearTimeout(deadline);
      child.kill();
      await child.exited;
    }
  }, 25000);
  it("issues encrypted intent, signs in across clients exactly once and onboards one hubless account", async () => {
    const email = address();
    expect((await call("/code/send", { email })).status).toBe(200);
    const otp = await code(email);
    expect(otp.length).toBe(6);
    const stored = await prisma.verification.findFirstOrThrow({
      where: { identifier: `sign-in-otp-${email}` },
    });
    expect(stored.value).not.toContain(otp);
    const res = await Promise.all([
      call("/code/verify", { email, code: otp, createAccount: true }),
      call(
        "/code/verify",
        { email, code: otp, createAccount: true },
        undefined,
        createDeliveryAuth(config),
      ),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 400]);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await prisma.hub.count({ where: { ownerUserId: user.id } })).toBe(0);
    expect(user.username).toMatch(/^[a-z]+-[a-z]+-[a-f0-9]{4}$/);
    expect(user.emailVerified).toBe(true);
    expect(
      await prisma.account.count({ where: { userId: user.id, providerId: "credential" } }),
    ).toBe(0);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });
  it("consumes one proof across separate processes", async () => {
    const email = address();
    await call("/code/send", { email });
    const otp = await code(email);
    const run = async () => {
      const child = Bun.spawn(["bun", resolve(__dirname, "fixtures/auth-process.ts")], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      child.stdin.write(JSON.stringify({ email, code: otp, secret, suppressionSecret }));
      child.stdin.end();
      const result = await new Response(child.stdout).text();
      expect(await child.exited).toBe(0);
      return Number(result);
    };
    expect((await Promise.all([run(), run()])).sort()).toEqual([200, 400]);
  }, 15000);
  it("rolls back proof and outbox even when native code swallows callback failure", async () => {
    const email = address();
    const broken = createDeliveryAuth({
      ...config,
      persistEmail: async () => {
        throw new Error("synthetic");
      },
    });
    expect((await call("/code/send", { email }, undefined, broken)).status).toBe(503);
    expect(await prisma.verification.count({ where: { identifier: `sign-in-otp-${email}` } })).toBe(
      0,
    );
    expect(
      await prisma.emailOutbox.count({
        where: { recipientKey: emailKey(suppressionSecret, "recipient", email) },
      }),
    ).toBe(0);
  });
  it("resend replaces prior proof and strips superseded pending mail; attempts and issue budgets apply", async () => {
    const email = address();
    await call("/code/send", { email });
    const old = await code(email);
    // An immediate resend waits out the gap and says how long remains.
    const early = await call("/code/send", { email });
    expect(early.status).toBe(429);
    const wait = Number(early.headers.get("retry-after"));
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(CODE_RESEND_SECONDS);
    await elapseResendGap(email);
    await call("/code/send", { email });
    const fresh = await code(email);
    expect((await call("/code/verify", { email, code: old })).status).toBe(400);
    expect((await call("/code/verify", { email, code: fresh })).status).toBe(200);
    expect(
      await prisma.emailOutbox.count({
        where: {
          recipientKey: emailKey(suppressionSecret, "recipient", email),
          state: "cancelled",
          payload: null,
        },
      }),
    ).toBe(1);
    const limited = address();
    for (let i = 0; i < 5; i++) {
      expect((await call("/code/send", { email: limited })).status).toBe(200);
      await elapseResendGap(limited);
    }
    expect((await call("/code/send", { email: limited })).status).toBe(429);
    const latest = await code(limited);
    const wrong = latest === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++)
      expect((await call("/code/verify", { email: limited, code: wrong })).status).toBe(400);
    expect((await call("/code/verify", { email: limited, code: latest })).status).toBe(403);
  });
  it("keeps email and account identity fixed across retired and native update routes", async () => {
    const owner = await signup();
    const next = address();
    const before = await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } });
    const messages = await prisma.emailOutbox.count();
    for (const token of [undefined, owner.token]) {
      for (const path of [
        "/email-change/start",
        "/email-change/confirm-current",
        "/email-change/confirm-new",
        "/change-email",
        "/email-otp/request-email-change",
        "/email-otp/change-email",
        "/update-user",
      ]) {
        const response = await call(
          path,
          {
            id: randomUUID(),
            email: next,
            newEmail: next,
            name: "Must not change",
            code: "12345678",
          },
          token,
        );
        expect(response.status).toBe(404);
        expect(response.headers.get("set-cookie")).toBeNull();
      }
    }
    expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).toEqual(before);
    expect(await prisma.user.findUnique({ where: { email: next } })).toBeNull();
    expect(await prisma.emailChangeIntent.count({ where: { userId: owner.user.id } })).toBe(0);
    expect(await prisma.emailOutbox.count()).toBe(messages);
    expect(
      await auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${owner.token}` }),
      }),
    ).not.toBeNull();
  });
  it("does not expose native proof bypasses or accept cross-origin issuance", async () => {
    const owner = await signup();
    for (const path of [
      "/email-otp/send-verification-otp",
      "/email-otp/change-email",
      "/verify-email",
      "/request-password-reset",
    ])
      expect((await call(path, { email: owner.email }, owner.token)).status).toBe(404);
    expect(
      (
        await auth.handler(
          new Request("http://localhost:4004/api/v1/auth/code/verify?code=12345678"),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await auth.handler(
          new Request("http://localhost:4004/api/v1/auth/code/send", {
            method: "POST",
            headers: { origin: "https://evil.example", "content-type": "application/json" },
            body: JSON.stringify({ email: address() }),
          }),
        )
      ).status,
    ).toBe(403);
  });
});
