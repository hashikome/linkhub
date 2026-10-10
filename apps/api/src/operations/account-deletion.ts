import { revokeAccountAccess } from "../auth/revoke-account";
import { readSecret } from "../config/secret";
import { authorityContext } from "../database/authority-context";
import type { PrismaService } from "../database/prisma.service";

export async function pruneDeletedAccounts(prisma: PrismaService, at = new Date()) {
  const candidates = await prisma.user.findMany({
    where: { deletionScheduledFor: { lte: at }, accountState: "inactive" },
    select: { id: true },
    orderBy: [{ deletionScheduledFor: "asc" }, { id: "asc" }],
    take: 25,
  });
  for (const candidate of candidates)
    await prisma.withAuthority(async () => {
      const tx = authorityContext.getStore();
      if (!tx) throw new Error("Missing authority transaction");
      const account = await tx.user.findUnique({
        where: { id: candidate.id },
        include: { adminGrant: true },
      });
      if (
        account?.accountState !== "inactive" ||
        !account.deletionScheduledFor ||
        account.deletionScheduledFor > at ||
        account.adminGrant
      )
        return;
      await revokeAccountAccess(
        tx,
        account.id,
        account.email,
        readSecret("BETTER_AUTH_SECRET") ?? "dev-better-auth-secret",
      );
      // FK cascades remove the owned hub/content and auth records; SetNull keeps
      // contributions to other hubs without retaining a deleted person's identity.
      await tx.user.delete({ where: { id: account.id } });
      await tx.auditLog.create({
        data: {
          category: "operation",
          actorKind: "deployment",
          authority: "account-maintenance",
          targetUserId: account.id,
          action: "account.deleted",
          outcome: "success",
          beforeState: "pending_deletion",
          afterState: "deleted",
          resultVersion: account.operationsVersion + 1,
        },
      });
    });
}
