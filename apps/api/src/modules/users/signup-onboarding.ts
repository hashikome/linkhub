import type { Prisma } from "../../generated/prisma/client";
import { ensurePersonalHub } from "../hubs/hub-onboarding";
import { accountUsername } from "./account-onboarding";

// App-owned identity/onboarding policy, shared by every credential provider.
// Call both phases inside the account-creation transaction after consent/proof.
export async function prepareSignup(tx: Prisma.TransactionClient, name: string, hubName?: string) {
  return {
    username: await accountUsername(
      tx,
      name,
      hubName
        ? async (candidate) =>
            !(await tx.hubHandleReservation.findUnique({ where: { handle: candidate } }))
        : undefined,
    ),
  };
}

export async function completeSignup(
  tx: Prisma.TransactionClient,
  userId: string,
  hubName?: string,
) {
  if (hubName) await ensurePersonalHub(tx, userId, hubName);
}
