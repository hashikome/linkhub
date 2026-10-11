import "server-only";
import { createHmac } from "node:crypto";
import { recoveryTtl } from "@nslinkhub/config/action-recovery";
import { webServerConfig } from "@nslinkhub/config/web-server";
import { cookies } from "next/headers";
import { recoveryRequest } from "./action-recovery";
import { serverCookie } from "./cookies";
import { openPendingAction, type PendingAction, sealPendingAction } from "./pending-action-codec";

export type { PendingAction } from "./pending-action-codec";

const name = "pending_action";
const storage = {
  put: (token: string, payload: string) => recoveryRequest({ operation: "put", token, payload }),
  get: (token: string) => recoveryRequest({ operation: "get", token }),
};

export async function pendingActionCookie(action: PendingAction | null) {
  if (action)
    return serverCookie(
      name,
      await sealPendingAction(action, webServerConfig().sourceSecret, storage),
      recoveryTtl,
    );
  const raw = (await cookies()).get(name)?.value;
  if (raw && /^ref\.[a-f0-9]{64}$/.test(raw)) {
    // Cleanup failure cannot fail an already completed action. TTL pruning remains.
    await recoveryRequest({ operation: "delete", token: raw.slice(4) }).catch(() => undefined);
  }
  return serverCookie(name, "", 0);
}

// Without a known account nothing is kept, so it cannot replay for another person.
export async function keepPendingAction(action: PendingAction) {
  const owner = await readLastAccount();
  if (!owner) return;
  (await cookies()).set(
    name,
    await sealPendingAction({ ...action, owner }, webServerConfig().sourceSecret, storage),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: recoveryTtl,
      secure: webServerConfig().publicOrigin.startsWith("https:"),
    },
  );
}
export async function readPendingAction(now = Date.now()): Promise<PendingAction | null> {
  const raw = (await cookies()).get(name)?.value;
  return raw ? openPendingAction(raw, webServerConfig().sourceSecret, storage, now) : null;
}

// The account last signed in on this browser, as a keyed one-way fingerprint
// of its email (not reversible). A waiting action records it and replays only
// if the same person signs in again; signing out clears it.
const lastAccount = "last_account";
export function accountFingerprint(email: string) {
  return createHmac("sha256", `web-last-account:${webServerConfig().sourceSecret}`)
    .update(email.trim().toLowerCase())
    .digest("base64url");
}
export function lastAccountCookie(email: string | null) {
  return email
    ? serverCookie(lastAccount, accountFingerprint(email), 60 * 60 * 24 * 90)
    : serverCookie(lastAccount, "", 0);
}
export async function readLastAccount() {
  const value = (await cookies()).get(lastAccount)?.value;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
