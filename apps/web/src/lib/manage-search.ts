import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { webServerConfig } from "@nslinkhub/config/web-server";

// Operator searches may contain an email address. They travel in page URLs
// (so results can be paged, refreshed and returned to) only as a short-lived
// encrypted `s` value, never as readable text in history or logs.
const ttl = 30 * 60 * 1000;
const key = () =>
  createHash("sha256").update(`web-ops-search:${webServerConfig().sourceSecret}`).digest();

export function sealSearch(text: string, now = Date.now()) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = JSON.stringify({ q: text.slice(0, 254), at: now });
  return Buffer.concat([iv, cipher.update(body), cipher.final(), cipher.getAuthTag()]).toString(
    "base64url",
  );
}

export function openSearch(raw: string | undefined, now = Date.now()): string {
  try {
    if (!raw || raw.length > 1024) return "";
    const bytes = Buffer.from(raw, "base64url"),
      decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    const value = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(),
    );
    if (typeof value.q !== "string" || !Number.isFinite(value.at)) return "";
    if (value.at > now || now - value.at > ttl) return "";
    return value.q;
  } catch {
    return "";
  }
}
