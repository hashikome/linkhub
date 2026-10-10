import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { readSecret } from "../config/secret";
import { emailConfig } from "../email/config";
import { PrismaClient } from "../generated/prisma/client";
import { createDeliveryAuth } from "./delivery-auth";
import { googleCredentials } from "./security-config";

// The raw auth handler exists before Nest boots. Dependencies are composed here,
// while tests and future delivery wiring use the same explicit factory.
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      readSecret("DATABASE_URL") ?? "postgresql://postgres:postgres@127.0.0.1:5436/nslinkhub",
  }),
});
export const auth = createDeliveryAuth({
  google: googleCredentials(),
  supportUrl: emailConfig().supportUrl,
  suppressionSecret: emailConfig().suppressionSecret,
  prisma,
  secret: readSecret("BETTER_AUTH_SECRET") ?? "dev-better-auth-secret",
  // Direct API default; the development launcher sets the public web origin.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  // Isolated verification shortens the gap; the web reads the same variable.
  codeResendSeconds: Number(process.env.AUTH_CODE_RESEND_SECONDS) || undefined,
});
