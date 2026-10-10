// Called only inside the ownership mutation's authority transaction.
import type { Prisma } from "../../generated/prisma/client";
import { nameFromHandle } from "../users/account-onboarding";
import { isReservedHandle } from "./handle";

export async function ensurePersonalHub(
  db: Pick<Prisma.TransactionClient, "hub" | "user" | "hubHandleReservation">,
  userId: string,
  name?: string,
) {
  const existing = await db.hub.findUnique({ where: { ownerUserId: userId } });
  if (existing) return existing;
  const person = await db.user.findUniqueOrThrow({ where: { id: userId } });
  for (let attempt = 0; attempt < 100; attempt++) {
    const handle = attempt
      ? `${person.username.slice(0, 55).replace(/-+$/, "")}-${attempt + 1}`
      : person.username;
    if (
      isReservedHandle(handle) ||
      (await db.hubHandleReservation.findUnique({ where: { handle } }))
    )
      continue;
    return db.hub.create({
      data: {
        ownerUserId: userId,
        handle,
        name: name ?? (person.name.trim() || nameFromHandle(person.username)),
      },
    });
  }
  throw new Error("Could not derive a unique hub handle");
}
