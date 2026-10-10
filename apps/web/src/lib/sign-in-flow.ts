import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { safeReturn } from "./http";
import { type VerificationPurpose, verificationPurposes } from "./verification";

export interface SignInFlow {
  intent?: "sign-in" | "sign-up";
  googleConnection?: boolean;
  invitationToken?: string;
  /** Why the code was sent: decides the wording and what runs afterwards. */
  purpose?: VerificationPurpose;
  email: string;
  returnTo: string;
  issued: number;
  retryAt?: number;
}
const flowKey = (secret: string) => createHash("sha256").update(`web-sign-in:${secret}`).digest();
export function sealSignInFlow(flow: SignInFlow, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", flowKey(secret), iv);
  return Buffer.concat([
    iv,
    cipher.update(JSON.stringify(flow)),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}
export function openSignInFlow(
  raw: string | undefined,
  secret: string,
  now = Date.now(),
): SignInFlow | null {
  try {
    if (!raw || raw.length > 8192) return null;
    const bytes = Buffer.from(raw, "base64url"),
      decipher = createDecipheriv("aes-256-gcm", flowKey(secret), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    const flow = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(),
    );
    if (
      typeof flow.email !== "string" ||
      (flow.intent !== undefined && !["sign-in", "sign-up"].includes(flow.intent)) ||
      typeof flow.returnTo !== "string" ||
      !Number.isFinite(flow.issued) ||
      flow.issued > now ||
      (flow.retryAt !== undefined && !Number.isFinite(flow.retryAt)) ||
      (flow.purpose !== undefined && !verificationPurposes.includes(flow.purpose)) ||
      now - flow.issued >
        (!flow.invitationToken && /^\/capture\/[a-f0-9-]{36}$/.test(flow.returnTo)
          ? 1800000
          : 600000)
    )
      return null;
    return { ...flow, returnTo: safeReturn(flow.returnTo) };
  } catch {
    return null;
  }
}

export function resendTiming(
  previous: SignInFlow | null,
  result: { ok: boolean; status?: number; retryAfter?: number },
  gapSeconds: number,
  now = Date.now(),
) {
  const issued = result.ok ? now : (previous?.issued ?? now);
  const retryAt = result.ok
    ? now + gapSeconds * 1000
    : result.status === 429 && result.retryAfter
      ? now + Math.min(result.retryAfter, 600) * 1000
      : (previous?.retryAt ?? issued + gapSeconds * 1000);
  return { issued, retryAt };
}
