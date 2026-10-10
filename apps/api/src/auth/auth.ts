import "dotenv/config";
import { publicOrigins } from "@nslinkhub/config/public-origins";
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
  // OAuth callbacks terminate at the API; browser destinations use the web origin.
  baseURL: publicOrigins(process.env).authOrigin,
  webOrigin: publicOrigins(process.env).webOrigin,
  // Isolated verification shortens the gap; the web reads the same variable.
  codeResendSeconds: Number(process.env.AUTH_CODE_RESEND_SECONDS) || undefined,
});
