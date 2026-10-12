import type { PersonRef } from "@ntumie/types";
import type { Prisma } from "../generated/prisma/client";

// Public people, independent of whether they own a hub.
export async function personRefs(
  db: Pick<Prisma.TransactionClient, "user">,
  userIds: Iterable<string | null | undefined>,
): Promise<Map<string, PersonRef>> {
  const ids = [...new Set([...userIds].filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const users = await db.user.findMany({
    where: { id: { in: ids }, accountState: "active" },
    select: {
      id: true,
      username: true,
    },
  });
  return new Map(users.map((user) => [user.id, { userId: user.id, username: user.username }]));
}
