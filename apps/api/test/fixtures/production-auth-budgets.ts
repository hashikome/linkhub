import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/app.setup";
import { PrismaService } from "../../src/database/prisma.service";
import { emailKey, unseal } from "../../src/email/outbox";

async function main() {
  assert.equal(process.env.NODE_ENV, "production");
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication({ bodyParser: false, logger: false });
  configureApp(app);
  try {
    await app.listen(0, "127.0.0.1");
    const origin = await app.getUrl();
    const addresses = Array.from({ length: 9 }, () => `budget-${randomUUID()}@example.com`);
    const post = async (path: string, body: unknown, forwarded = "198.51.100.20") => {
      const response = await fetch(`${origin}/api/v1/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:4004",
          "x-forwarded-for": forwarded,
        },
        body: JSON.stringify(body),
      });
      // Consume the body so every request can reuse/close its connection.
      await response.arrayBuffer();
      return response;
    };
    // Same source, four different recipients: the plugin's production default
    // rejects the fourth even though neither shared budget is exhausted.
    for (const email of addresses.slice(0, 4))
      assert.equal((await post("/code/send", { email })).status, 200, "distinct-address issuance");

    const prisma = app.get(PrismaService);
    // An immediate resend waits out the per-address gap and says how long.
    const early = await post("/code/send", { email: addresses[0] });
    assert.equal(early.status, 429, "resend inside the gap");
    assert.ok(Number(early.headers.get("retry-after")) > 0, "resend gap retry-after");
    const elapseGap = () =>
      prisma.$executeRaw`UPDATE request_budgets SET expires_at = clock_timestamp() WHERE key = ${emailKey(process.env.BETTER_AUTH_SECRET ?? "", "issue-gap", addresses[0])}`;

    // The first address can receive five issues total, then the identity budget
    // rejects its sixth without limiting unrelated recipients.
    for (let i = 0; i < 4; i++) {
      await elapseGap();
      assert.equal(
        (await post("/code/send", { email: addresses[0] })).status,
        200,
        "resend within budget",
      );
    }
    await elapseGap();
    assert.equal(
      (await post("/code/send", { email: addresses[0] })).status,
      429,
      "sixth identity issue",
    );

    const row = await prisma.emailOutbox.findFirstOrThrow({
      where: {
        recipientKey: emailKey(
          process.env.EMAIL_SUPPRESSION_SECRET ?? "",
          "recipient",
          addresses[1],
        ),
        state: "pending",
      },
    });
    const payload = unseal(row.payload ?? "", process.env.BETTER_AUTH_SECRET ?? "");
    const code = payload.text.match(/\b\d{8}\b/)?.[0];
    assert.equal(
      (await post("/code/verify", { email: addresses[1], code })).status,
      200,
      "real production sign-in",
    );

    // No challenge exists for this address: every invalid verification consumes
    // the shared identity budget without creating a session or sending mail.
    for (let i = 0; i < 15; i++)
      assert.equal(
        (await post("/code/verify", { email: addresses[4], code: "00000000" })).status,
        400,
        "verification within budget",
      );
    assert.equal(
      (await post("/code/verify", { email: addresses[4], code: "00000000" })).status,
      429,
      "sixteenth identity verification",
    );

    // Twenty-seven HTTP requests so far, including rejected gap and identity requests.
    for (const email of addresses.slice(6))
      assert.equal(
        (await post("/code/send", { email })).status,
        200,
        "source budget still available",
      );
    const blocked = await post(
      "/code/send",
      { email: `blocked-${randomUUID()}@example.com` },
      "198.51.100.21",
    );
    assert.equal(blocked.status, 429, "thirty-first source request despite spoofed forwarding");
    assert.equal(blocked.headers.get("retry-after"), "60");
    assert.equal(
      await prisma.emailOutbox.count({
        where: {
          recipientKey: {
            in: addresses.map((email) =>
              emailKey(process.env.EMAIL_SUPPRESSION_SECRET ?? "", "recipient", email),
            ),
          },
        },
      }),
      11,
      "only accepted issuance persists mail",
    );
  } finally {
    // This fixture owns the listener; pooled fetch sockets must not delay shutdown.
    app.getHttpServer().closeAllConnections();
    await app.close();
  }
}

void main().then(
  () => process.exit(0),
  (error) => {
    // Assertion output contains only the named budget check and status/count.
    process.stderr.write(String(error));
    process.exit(1);
  },
);
