import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { type ApiError, apiErrors } from "@linkhub/types";
import type { RequestHandler } from "express";
import { readSecret } from "../../config/secret";
import type { PrismaService } from "../../database/prisma.service";
import type { RequestWithId } from "./request-id";
import { verifiedWebReadSource } from "./web-read-source";

export function trustedProxies(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value.split(",").map((part) => {
    const cidr = part.trim();
    const [address, mask, extra] = cidr.split("/");
    const family = isIP(address);
    if (
      !family ||
      extra !== undefined ||
      (mask !== undefined && (!/^\d+$/.test(mask) || Number(mask) > (family === 4 ? 32 : 128)))
    ) {
      throw new Error("TRUSTED_PROXY_CIDRS must contain only explicit IP addresses or CIDRs");
    }
    return cidr;
  });
}

export function requestBudgetKey(scope: string, source: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`request-budget:v1\0${scope}\0${source}`)
    .digest("hex");
}

export function requestBudget(
  prisma: PrismaService,
  secret = readSecret("BETTER_AUTH_SECRET") ?? "dev-better-auth-secret",
  sourceSecret = readSecret("WEB_SOURCE_SECRET"),
): RequestHandler {
  return async (request, response, next) => {
    // Match Express route casing and optional trailing slashes when assigning budgets.
    const path = request.path.toLowerCase().replace(/\/+$/, "");
    // Infrastructure probes must remain reachable during dependency outages.
    if (request.method === "GET" && ["/api/v1/health", "/api/v1/status"].includes(path))
      return next();
    const scope =
      (path === "/api/v1/auth/invitations/preview" && request.method === "POST") ||
      (request.method === "GET" &&
        [
          "/api/v1/auth/methods",
          "/api/v1/auth/security/status",
          "/api/v1/auth/google-connection",
          "/api/v1/auth/account/recovery",
          "/api/v1/auth/email-registration",
        ].includes(path))
        ? "read"
        : path.startsWith("/api/v1/auth/")
          ? "auth"
          : (path === "/api/v1/imports" && request.method === "POST") ||
              /^\/api\/v1\/exports(\/|$)/.test(path)
            ? "file"
            : path === "/api/v1/link-preview"
              ? "lookup"
              : ["GET", "HEAD", "OPTIONS"].includes(request.method)
                ? "read"
                : "write";
    const limit = { auth: 30, file: 10, lookup: 30, read: 300, write: 60 }[scope];
    const key = requestBudgetKey(
      scope,
      (scope === "read" || scope === "lookup"
        ? verifiedWebReadSource(request.get("x-web-read-source"), sourceSecret)
        : ["POST", "PATCH", "DELETE", "PUT"].includes(request.method)
          ? verifiedWebReadSource(
              request.get("x-web-form-source"),
              sourceSecret,
              Date.now(),
              "form",
            )
          : undefined) ??
        request.ip ??
        request.socket.remoteAddress ??
        "unknown",
      secret,
    );
    try {
      const rows = await prisma.$queryRaw<Array<{ count: number }>>`
        INSERT INTO request_budgets (key, count, expires_at)
        VALUES (${key}, 1, clock_timestamp() + interval '1 minute')
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN request_budgets.expires_at <= clock_timestamp() THEN 1 ELSE request_budgets.count + 1 END,
          expires_at = CASE WHEN request_budgets.expires_at <= clock_timestamp() THEN clock_timestamp() + interval '1 minute' ELSE request_budgets.expires_at END
        WHERE request_budgets.expires_at <= clock_timestamp() OR request_budgets.count < ${limit}
        RETURNING count`;
      if (rows.length > 0) return next();
      response.setHeader("Retry-After", "60");
      response.status(429).json({
        error: {
          code: "too_many_requests",
          message: apiErrors.too_many_requests.message,
          requestId: (request as RequestWithId).requestId,
          details: {},
        },
      } satisfies ApiError);
    } catch {
      // A failed shared budget store must not silently remove abuse protection.
      response.status(503).json({
        error: {
          code: "service_unavailable",
          message: apiErrors.service_unavailable.message,
          requestId: (request as RequestWithId).requestId,
          details: {},
        },
      } satisfies ApiError);
    }
  };
}
