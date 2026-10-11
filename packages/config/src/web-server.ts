import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { publicOrigins } from "./public-origins";

export function webServerConfig(env: Record<string, string | undefined> = process.env) {
  const value = env.API_INTERNAL_ORIGIN_FILE
    ? readFileSync(env.API_INTERNAL_ORIGIN_FILE, "utf8").trim()
    : env.API_INTERNAL_ORIGIN;
  if (!value && env.NODE_ENV === "production")
    throw new Error("API_INTERNAL_ORIGIN is required in production");
  let url: URL;
  try {
    url = new URL(value || "http://127.0.0.1:4004");
  } catch {
    throw new Error("Invalid API_INTERNAL_ORIGIN");
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("API_INTERNAL_ORIGIN must be an HTTP(S) origin without credentials or a path");
  const sourceSecret = env.WEB_SOURCE_SECRET_FILE
    ? readFileSync(env.WEB_SOURCE_SECRET_FILE, "utf8").trim()
    : env.WEB_SOURCE_SECRET?.trim();
  if (!sourceSecret || sourceSecret.length < 32)
    throw new Error("WEB_SOURCE_SECRET requires at least 32 characters");
  const trustedProxies = (env.WEB_TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const cidr of trustedProxies) {
    const [address, mask, extra] = cidr.split("/");
    const family = isIP(address);
    if (
      !family ||
      extra !== undefined ||
      (mask !== undefined && (!/^\d+$/.test(mask) || Number(mask) > (family === 4 ? 32 : 128)))
    )
      throw new Error("WEB_TRUSTED_PROXY_CIDRS requires explicit IP addresses or CIDRs");
  }
  const { webOrigin: publicOrigin, authOrigin } = publicOrigins(env);
  // Mirrors the API's sign-in code resend gap (apps/api/src/auth/delivery-auth.ts).
  const codeResendSeconds = Number(env.AUTH_CODE_RESEND_SECONDS) || 30;
  // Shown on /support, which every email footer links to.
  const supportEmail = env.SUPPORT_EMAIL?.trim() || undefined;
  if (supportEmail && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(supportEmail))
    throw new Error("SUPPORT_EMAIL must be an email address");
  return {
    publicOrigin,
    authOrigin,
    apiOrigin: url.origin,
    sourceSecret,
    trustedProxies,
    codeResendSeconds,
    supportEmail,
  };
}
