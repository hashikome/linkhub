import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { recoveryPayloadLimit, recoveryTtl } from "@nslinkhub/config/action-recovery";
import type { ApiPath } from "./http";

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

const key = (secret: string) =>
  createHash("sha256").update(`web-pending-action:${secret}`).digest();
export const pendingCookieLimit = 3800;
export interface ActionStorage {
  put(token: string, payload: string): Promise<unknown>;
  get(token: string): Promise<string | null>;
}
export async function sealPendingAction(
  action: PendingAction,
  secret: string,
  storage: ActionStorage,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const sealed = Buffer.concat([
    iv,
    cipher.update(JSON.stringify(action)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
  if (sealed.length > recoveryPayloadLimit) throw new Error("pending-action-size");
  if (sealed.length <= pendingCookieLimit) return sealed;
  const token = randomBytes(32).toString("hex");
  await storage.put(token, sealed);
  return `ref.${token}`;
}
export async function openPendingAction(
  raw: string,
  secret: string,
  storage: ActionStorage,
  now = Date.now(),
): Promise<PendingAction | null> {
  if (!raw || raw.length > 4000) return null;
  // Do not turn a storage outage into a missing action and silently continue sign-in.
  const sealed = /^ref\.[a-f0-9]{64}$/.test(raw) ? await storage.get(raw.slice(4)) : raw;
  if (!sealed || sealed.length > recoveryPayloadLimit) return null;
  try {
    const bytes = Buffer.from(sealed, "base64url"),
      decipher = createDecipheriv("aes-256-gcm", key(secret), bytes.subarray(0, 12));
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
      now - action.issued > recoveryTtl * 1000
    )
      return null;
    return action;
  } catch {
    return null;
  }
}
