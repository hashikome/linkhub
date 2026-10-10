import { randomBytes } from "node:crypto";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { emailKey } from "../email/outbox";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

type Store = PrismaClient | Prisma.TransactionClient;
export const registrationCookieName = (baseURL: string) =>
  `${baseURL.startsWith("https:") ? "__Secure-" : ""}better-auth.email_registration`;
export function registrationToken(headers: Headers, baseURL: string) {
  return (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${registrationCookieName(baseURL)}=`))
    ?.split("=")[1];
}
export function registrationCookie(baseURL: string, token = "") {
  return `${registrationCookieName(baseURL)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 600 : 0}${baseURL.startsWith("https:") ? "; Secure" : ""}`;
}
const identifier = (secret: string, token: string) =>
  `email-registration:${emailKey(secret, "email-registration", token)}`;
export async function discardEmailRegistration(prisma: Store, secret: string, token?: string) {
  if (token)
    await prisma.verification.deleteMany({ where: { identifier: identifier(secret, token) } });
}
export async function stageEmailRegistration(prisma: Store, secret: string, email: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.verification.create({
    data: {
      identifier: identifier(secret, token),
      value: await symmetricEncrypt({ key: secret, data: JSON.stringify({ email }) }),
      expiresAt: new Date(Date.now() + 600000),
    },
  });
  return token;
}
export async function pendingEmailRegistration(prisma: Store, secret: string, token?: string) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const record = await prisma.verification.findFirst({
    where: {
      identifier: identifier(secret, token),
      expiresAt: { gt: new Date() },
    },
  });
  if (!record) return null;
  const { email } = JSON.parse(await symmetricDecrypt({ key: secret, data: record.value })) as {
    email: string;
  };
  // A racing signup must authenticate independently; a pending creation cannot
  // become sign-in to an account which did not exist when its proof was staged.
  if (await prisma.user.findUnique({ where: { email } })) return null;
  return { record, email };
}
