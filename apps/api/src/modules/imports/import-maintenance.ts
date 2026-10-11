import { AUTHORITY_LOCK } from "../../database/authority-context";
import type { PrismaClient } from "../../generated/prisma/client";

// Expiry is independent of metadata lookup availability. Serialize with commits
// so cleanup cannot remove a draft between validation and writing its receipts.
export async function expireImportDrafts(prisma: PrismaClient, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUTHORITY_LOCK}::bigint)`;
    const expired = await tx.importDraft.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    return tx.importDraft.deleteMany({
      where: { id: { in: expired.map((d) => d.id) }, expiresAt: { lte: now } },
    });
  });
}
