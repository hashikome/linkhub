import { randomBytes, randomUUID } from "node:crypto";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { emailKey } from "../email/outbox";
import type { Prisma, PrismaClient } from "../generated/prisma/client";

type Store = PrismaClient | Prisma.TransactionClient;
export interface GoogleIdentity {
  subject: string;
  email: string;
  name?: string;
}
export const googleConnectionCookie = (baseURL: string) =>
  `${baseURL.startsWith("https:") ? "__Secure-" : ""}better-auth.google_connection`;
export const googleConnectionCookieOptions = (baseURL: string, maxAge = 600) => ({
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: baseURL.startsWith("https:"),
  maxAge,
});
export function googleConnectionToken(headers: Headers, baseURL: string) {
  const name = googleConnectionCookie(baseURL);
  return (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function identifier(secret: string, token: string) {
  if (!/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return `google-connect:${token.slice(0, 36)}:${emailKey(secret, "google-connect", token)}`;
}
export function connectionCookieHeader(baseURL: string, token = "") {
  return `${googleConnectionCookie(baseURL)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 600 : 0}${baseURL.startsWith("https:") ? "; Secure" : ""}`;
}
export async function discardGoogleConnection(prisma: Store, secret: string, token?: string) {
  const key = token ? identifier(secret, token) : null;
  if (key) await prisma.verification.deleteMany({ where: { identifier: key } });
}
export async function pendingGoogleConnection(
  prisma: Store,
  secret: string,
  token?: string,
  createdUserId?: string,
) {
  const key = token ? identifier(secret, token) : null;
  if (!key) return null;
  const record = await prisma.verification.findFirst({
    where: { identifier: key, expiresAt: { gt: new Date() } },
  });
  if (!record) return null;
  const proof = JSON.parse(
    await symmetricDecrypt({ key: secret, data: record.value }),
  ) as GoogleIdentity & { userId: string | null; version: number | null };
  if (proof.userId === null) {
    const user = await prisma.user.findUnique({ where: { email: proof.email } });
    // Only the confirmed Google registration transaction that created this user may
    // finish an unregistered identity. A racing registration requires a restart.
    if (
      user &&
      (user.id !== createdUserId || !user.emailVerified || user.accountState !== "active")
    )
      return null;
    return { record, proof, user };
  }
  const user = await prisma.user.findUnique({ where: { id: proof.userId } });
  if (
    user?.accountState !== "active" ||
    !user.emailVerified ||
    user.email !== proof.email ||
    user.operationsVersion !== proof.version
  )
    return null;
  return { record, proof, user };
}
/** Called only after Better Auth validated OAuth and refused linking or provider-only signup. */
export async function stageGoogleConnection(
  prisma: Store,
  secret: string,
  identity: GoogleIdentity,
) {
  const user = await prisma.user.findUnique({ where: { email: identity.email } });
  if (user && (!user.emailVerified || user.accountState !== "active")) return null;
  const token = `${user?.id ?? randomUUID()}.${randomBytes(32).toString("base64url")}`;
  const key = identifier(secret, token);
  if (!key) throw new Error("Invalid generated connection identifier");
  await prisma.verification.create({
    data: {
      identifier: key,
      value: await symmetricEncrypt({
        key: secret,
        data: JSON.stringify({
          ...identity,
          userId: user?.id ?? null,
          version: user?.operationsVersion ?? null,
        }),
      }),
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  return token;
}
