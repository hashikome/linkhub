import { afterAll } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import request from "supertest";
import type { App } from "supertest/types";
import { readSecret } from "../../src/config/secret";
import { emailConfig } from "../../src/email/config";
import { emailKey, unseal } from "../../src/email/outbox";
import { PrismaClient } from "../../src/generated/prisma/client";
import { ensurePersonalHub } from "../../src/modules/hubs/hub-onboarding";

// Test-only capture inspection. Every fixture traverses the production HTTP
// issuance and consumption paths; no minted or replaced proof/session records.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
afterAll(async () => {
  await prisma.$disconnect();
});
export async function signInWithCode(server: App, input: { email: string; name?: string }) {
  if (process.env.NODE_ENV !== "test" || process.env.EMAIL_PROVIDER !== "capture")
    throw new Error("Code fixture requires isolated capture tests");
  await request(server).post("/api/v1/auth/code/send").send({ email: input.email }).expect(200);
  const secret = readSecret("BETTER_AUTH_SECRET") ?? "dev-better-auth-secret";
  const row = await prisma.emailOutbox.findFirstOrThrow({
    where: {
      recipientKey: emailKey(
        emailConfig().suppressionSecret,
        "recipient",
        input.email.toLowerCase(),
      ),
      state: "pending",
    },
    orderBy: { createdAt: "desc" },
  });
  const code = unseal(row.payload ?? "", secret).text.match(/^\d{6}$/m)?.[0];
  if (!code) throw new Error("Expected captured code");
  return request(server)
    .post("/api/v1/auth/code/verify")
    .send({ ...input, code, createAccount: true })
    .expect(200);
}

// Explicit fixture for scenarios that start with an existing publishing hub.
// Ordinary sign-in stays hubless; identity/first-save suites use it directly.
export async function signInHubOwner(server: App, input: { email: string; name?: string }) {
  const response = await signInWithCode(server, input);
  await prisma.$transaction((tx) => ensurePersonalHub(tx, response.body.user.id));
  return response;
}
