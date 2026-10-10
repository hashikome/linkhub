import { randomBytes } from "node:crypto";
import { emailKey } from "../email/outbox";
import type { Prisma } from "../generated/prisma/client";
import { accountActionContext } from "./account-lifecycle";

export const recoveryCookieName = (baseURL: string) =>
  `${baseURL.startsWith("https:") ? "__Secure-" : ""}better-auth.account_recovery`;
export const recoveryCookie = (baseURL: string, token = "") =>
  `${recoveryCookieName(baseURL)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? 600 : 0}${baseURL.startsWith("https:") ? "; Secure" : ""}`;

export async function recoveryContext(tx: Prisma.TransactionClient, secret: string, email: string) {
  const user = await tx.user.findUnique({ where: { email } });
  if (user?.accountState !== "inactive" || !user.selfDeactivated) return null;
  const context = await accountActionContext(
    tx,
    secret,
    {
      email,
      action: user.deletionScheduledFor ? "cancel_deletion" : "reactivate",
    },
    null,
  );
  return context.account ? context : null;
}

export async function stageRecovery(
  tx: Prisma.TransactionClient,
  secret: string,
  context: NonNullable<Awaited<ReturnType<typeof recoveryContext>>>,
) {
  const user = context.account;
  if (!user) throw new Error("Missing recovery identity");
  const token = `${user.id}.${randomBytes(32).toString("base64url")}`;
  await tx.verification.create({
    data: {
      identifier: `account-action:${user.id}:recovery:${emailKey(secret, "recovery", token)}`,
      value: JSON.stringify({
        email: user.email,
        version: user.operationsVersion,
        action: context.action,
      }),
      expiresAt: new Date(Date.now() + 600_000),
    },
  });
  return token;
}

export async function readRecovery(
  tx: Prisma.TransactionClient,
  secret: string,
  baseURL: string,
  headers: Headers,
) {
  const token = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${recoveryCookieName(baseURL)}=`))
    ?.split("=")[1];
  if (!token || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const record = await tx.verification.findFirst({
    where: {
      identifier: `account-action:${token.slice(0, 36)}:recovery:${emailKey(secret, "recovery", token)}`,
      expiresAt: { gt: new Date() },
    },
  });
  if (!record) return null;
  const binding = JSON.parse(record.value);
  const context = await recoveryContext(tx, secret, binding.email);
  if (
    !context?.account ||
    context.account.id !== token.slice(0, 36) ||
    context.account.operationsVersion !== binding.version ||
    context.action !== binding.action
  )
    return null;
  return { record, context };
}
