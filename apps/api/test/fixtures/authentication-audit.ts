import { expect } from "bun:test";
import type { Prisma } from "../../src/generated/prisma/client";

export async function expectSignIns(
  db: Pick<Prisma.TransactionClient, "auditLog">,
  userId: string,
  methods: string[],
) {
  const events = await db.auditLog.findMany({
    where: {
      category: "authentication",
      outcome: "success",
      AND: [
        { OR: [{ actorUserId: userId }, { targetUserId: userId }] },
        { OR: [{ action: { startsWith: "security.sign_in." } }, { action: "code.verify" }] },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { action: true, actorKind: true, actorUserId: true, targetUserId: true },
  });
  expect(events).toEqual(
    methods.map((method) => ({
      action: `security.sign_in.${method}`,
      actorKind: "user",
      actorUserId: userId,
      targetUserId: userId,
    })),
  );
}
