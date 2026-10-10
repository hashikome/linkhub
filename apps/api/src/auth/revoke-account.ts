import { emailKey } from "../email/outbox";
import type { Prisma } from "../generated/prisma/client";
import { invalidateAccountInvitations } from "../operations/invitations";
import { handoverIdentifiers } from "./handover-proofs";

// Caller holds the auth authority lock. Proofs and delivery are revoked together.
export async function revokeAccountAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  address: string,
  secret: string,
) {
  const intent = await tx.emailChangeIntent.findUnique({ where: { userId } });
  const lifecycleProofs = await tx.verification.findMany({
    where: { identifier: { startsWith: `account-action:${userId}:` } },
    select: { identifier: true },
  });
  const identifiers = [
    ...lifecycleProofs.map((proof) => proof.identifier),
    `sign-in-otp-${address}`,
    `email-verification-otp-${address}`,
    ...(intent ? Object.values(handoverIdentifiers(secret, intent)) : []),
  ];
  await tx.verification.deleteMany({ where: { identifier: { in: identifiers } } });
  await tx.emailOutbox.updateMany({
    where: {
      challengeKey: { in: identifiers.map((id) => emailKey(secret, "challenge", id)) },
      state: "pending",
    },
    data: { state: "cancelled", payload: null },
  });
  await tx.emailChangeIntent.deleteMany({ where: { userId } });
  await tx.session.deleteMany({ where: { userId } });
  await tx.operatorGrant.deleteMany({ where: { userId } });
  await tx.adminGrant.deleteMany({ where: { userId } });
  await invalidateAccountInvitations(tx, userId, address);
}
