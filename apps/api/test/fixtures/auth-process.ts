import { PrismaPg } from "@prisma/adapter-pg";
import { createDeliveryAuth } from "../../src/auth/delivery-auth";
import { PrismaClient } from "../../src/generated/prisma/client";

async function main() {
  const input = JSON.parse(await Bun.stdin.text());
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const auth = createDeliveryAuth({
    prisma,
    secret: input.secret,
    suppressionSecret: input.suppressionSecret,
    baseURL: "http://localhost:4004",
    supportUrl: "https://fixture-links.dev/support",
  });
  const response = await auth.handler(
    new Request("http://localhost:4004/api/v1/auth/code/verify", {
      method: "POST",
      headers: { origin: "http://localhost:4004", "content-type": "application/json" },
      body: JSON.stringify({ email: input.email, code: input.code }),
    }),
  );
  process.stdout.write(String(response.status));
  await prisma.$disconnect();
}
void main();
