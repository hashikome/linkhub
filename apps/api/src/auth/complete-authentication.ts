import type { Prisma } from "../generated/prisma/client";
import { finishInvitation } from "../operations/recipient";

export type AuthenticationMethod = "email" | "google" | "passkey" | "totp" | "recovery";

// Called after all credential, factor, identity and association checks, within
// the transaction that created the session. Never call for proof-only workflows.
export async function completeAuthentication(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    sessionId: string;
    method: AuthenticationMethod;
    invitationToken?: string;
  },
) {
  const { userId, sessionId, method, invitationToken } = input;
  if (invitationToken) await finishInvitation(tx, invitationToken, userId);
  const now = new Date();
  await tx.session.update({
    where: { id: sessionId, userId },
    data: { verifiedAt: now, authenticationMethod: method },
  });
  await tx.user.update({ where: { id: userId }, data: { lastLoginAt: now } });
  await tx.auditLog.create({
    data: {
      category: "authentication",
      actorKind: "user",
      actorUserId: userId,
      targetUserId: userId,
      action: `security.sign_in.${method}`,
      outcome: "success",
    },
  });
}
