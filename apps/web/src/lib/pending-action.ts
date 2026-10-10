import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { webServerConfig } from "@nslinkhub/config/web-server";
import { cookies } from "next/headers";
import { serverCookie } from "./cookies";
import type { ApiPath } from "./http";

// An action interrupted by email verification: a sensitive operator action
// that needs a fresh code ("confirm"), or any form action whose session ended
// ("resume"). It is kept, encrypted, and replayed once after the code with the
// new session; operator actions keep their operation id so they can't
// double-apply.
export interface PendingAction {
  path: ApiPath;
  method?: "POST" | "PATCH" | "DELETE" | "PUT";
  body: Record<string, unknown>;
  /** Where to return afterwards (the page the action was taken from). */
  target: string;
  /** What the action does, for "To …" / "before we could …". */
  label: string;
  /** Notice shown after a successful replay (defaults to "done"). */
  success?: string;
  /** Preserve the one-time token returned by a resumed collection link change. */
  result?: "collection-link";
  /** Fragment to land on after the replay, e.g. the discussion. */
  anchor?: string;
  /** Fingerprint of the account it belongs to; it replays only for them. */
  owner?: string;
  issued: number;
}

const ttl = 15 * 60;
const name = "pending_action";
const key = () =>
  createHash("sha256").update(`web-pending-action:${webServerConfig().sourceSecret}`).digest();

function seal(action: PendingAction) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  return Buffer.concat([
    iv,
    cipher.update(JSON.stringify(action)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}

export function pendingActionCookie(action: PendingAction | null) {
  return action ? serverCookie(name, seal(action), ttl) : serverCookie(name, "", 0);
}

// For server actions, which set cookies through next/headers. Without a known
// owner nothing is kept, so it can never replay for someone else.
export async function keepPendingAction(action: PendingAction) {
  const owner = await readLastAccount();
  if (!owner) return;
  (await cookies()).set(name, seal({ ...action, owner }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
    secure: webServerConfig().publicOrigin.startsWith("https:"),
  });
}

export async function readPendingAction(now = Date.now()): Promise<PendingAction | null> {
  try {
    const raw = (await cookies()).get(name)?.value;
    if (!raw || raw.length > 4000) return null;
    const bytes = Buffer.from(raw, "base64url"),
      decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    const action = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(),
    ) as PendingAction;
    if (
      typeof action.path !== "string" ||
      !action.path.startsWith("/api/v1/") ||
      action.path.startsWith("/api/v1/auth/") ||
      (action.method !== undefined &&
        !["POST", "PATCH", "DELETE", "PUT"].includes(action.method)) ||
      typeof action.target !== "string" ||
      !action.target.startsWith("/") ||
      action.target.startsWith("//") ||
      typeof action.label !== "string" ||
      !Number.isFinite(action.issued) ||
      action.issued > now ||
      now - action.issued > ttl * 1000
    )
      return null;
    return action;
  } catch {
    return null;
  }
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
