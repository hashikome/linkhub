import { type AccountAction, accountActions } from "@linkhub/types";
import { appError } from "../common/errors/app-exception";
import { emailKey } from "../email/outbox";
import type { Prisma } from "../generated/prisma/client";
import { revokeAccountAccess } from "./revoke-account";

type Session = { user: { id: string; email: string }; session: { id: string } } | null;
export async function accountActionContext(
  tx: Prisma.TransactionClient,
  secret: string,
  body: Record<string, unknown>,
  session: Session,
) {
  if (!accountActions.includes(body.action as AccountAction)) throw appError("bad_request");
  const action = body.action as AccountAction;
  const recovery = action === "reactivate" || action === "cancel_deletion";
  if (!recovery && !session) throw appError("unauthorized");
  if (recovery && session) throw appError("forbidden");
  const address = recovery
    ? String(body.email ?? "")
        .trim()
        .toLowerCase()
    : session?.user.email;
  if (!address || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    throw appError("bad_request");
  const account = await tx.user.findUnique({
    where: { email: address },
    include: { adminGrant: true },
  });
  const eligible =
    account &&
    !account.adminGrant &&
    (recovery
      ? account.accountState === "inactive" &&
        account.selfDeactivated &&
        (action === "reactivate"
          ? !account.deletionScheduledFor
          : account.deletionScheduledFor !== null && account.deletionScheduledFor > new Date())
      : account.id === session?.user.id &&
        account.accountState === "active" &&
        !account.deletionScheduledFor);
  return {
    action,
    address,
    account: eligible ? account : null,
    identifier: account
      ? `account-action:${account.id}:${emailKey(
          secret,
          "account-action",
          JSON.stringify([
            action,
            account.id,
            account.email,
            account.operationsVersion,
            recovery ? null : session?.session.id,
          ]),
        )}`
      : "",
  };
}

export async function completeAccountAction(
  tx: Prisma.TransactionClient,
  secret: string,
  context: Awaited<ReturnType<typeof accountActionContext>>,
) {
  const { account, action } = context;
  if (!account) throw appError("forbidden");
  await revokeAccountAccess(tx, account.id, account.email, secret);
  const saved = await tx.user.update({
    where: { id: account.id },
    data: {
      accountState: action === "reactivate" ? "active" : "inactive",
      selfDeactivated: action !== "reactivate",
      deletionScheduledFor: action === "delete" ? new Date(Date.now() + 14 * 86400000) : null,
      operationsVersion: { increment: 1 },
    },
  });
  await tx.auditLog.create({
    data: {
      category: "operation",
      actorKind: "user",
      actorUserId: account.id,
      targetUserId: account.id,
      action: `account.${action}`,
      reason: "owner_request",
      outcome: "success",
      beforeState: account.deletionScheduledFor ? "pending_deletion" : account.accountState,
      afterState: saved.deletionScheduledFor ? "pending_deletion" : saved.accountState,
      resultVersion: saved.operationsVersion,
    },
  });
  return { success: true, deletionScheduledFor: saved.deletionScheduledFor?.toISOString() ?? null };
}
