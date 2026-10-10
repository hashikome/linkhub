import { AppException, appError } from "../common/errors/app-exception";
import { AUTHORITY_LOCK } from "../database/authority-context";
import { emailKey } from "../email/outbox";
import type { Prisma } from "../generated/prisma/client";
import { createAuth } from "./create-auth";
import type { DeliveryAuthOptions } from "./delivery-auth";
import type { SecurityContext } from "./security-plugins";

const root = "/api/v1/auth";
const getPaths = new Set(["/security/status", "/methods", "/callback/google"]);
const postPaths = new Set([
  "/sign-in/social",
  "/link-social",
  "/security/google/remove",
  "/passkey/generate-authenticate-options",
  "/passkey/verify-authentication",
  "/security/passkey/options",
  "/security/passkey/verify",
  "/security/passkey/remove",
  "/security/totp/start",
  "/security/totp/confirm",
  "/security/totp/remove",
  "/security/recovery/rotate",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);
export const securityPath = (path: string) => getPaths.has(path) || postPaths.has(path);
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const failed = (status = 400, code = "invalid_request") =>
  json(
    {
      error: {
        code,
        message:
          code === "recent_auth_required"
            ? "Sign in again to continue"
            : "Unable to complete this request",
      },
    },
    status,
  );
export async function invalidateSecurityChallenges(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.verification.findMany({
    where: { value: userId, identifier: { startsWith: "2fa-" } },
    select: { identifier: true },
  });
  await tx.verification.deleteMany({
    where: {
      identifier: {
        in: rows.flatMap(({ identifier }) => [
          identifier,
          `2fa-attempts-${identifier}`,
          `security-context:${identifier}`,
        ]),
      },
    },
  });
}

export async function securityHandler(
  request: Request,
  options: DeliveryAuthOptions,
): Promise<Response> {
  const { prisma, secret, baseURL, google } = options;
  const path = new URL(request.url).pathname.slice(root.length);
  if (
    !(request.method === "GET" ? getPaths : request.method === "POST" ? postPaths : new Set()).has(
      path,
    )
  )
    return failed(404);
  const origin = new URL(baseURL).origin;
  if (
    request.method === "POST" &&
    ((request.headers.get("origin") && request.headers.get("origin") !== origin) ||
      (!request.headers.get("origin") && request.headers.has("cookie")) ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    return failed(403);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      const reader = request.body?.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      if (reader)
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16384) {
            await reader.cancel();
            return failed(413);
          }
          parts.push(value);
        }
      body = JSON.parse(Buffer.concat(parts).toString() || "{}");
      if (!body || typeof body !== "object" || Array.isArray(body)) return failed();
    } catch {
      return failed();
    }
  }
  if (path === "/methods") return json({ data: { google: !!google, passkey: true } });
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUTHORITY_LOCK}::bigint)`;
        const security: SecurityContext = {};
        const auth = createAuth({ prisma: tx, secret, baseURL, google, security });
        const signed = await auth.api.getSession({ headers: request.headers });
        const user = signed ? await tx.user.findUnique({ where: { id: signed.user.id } }) : null;
        if (signed && user?.accountState !== "active") return failed(401);
        const session = signed
          ? await tx.session.findUnique({ where: { id: signed.session.id } })
          : null;
        const fresh = !!session?.verifiedAt && session.verifiedAt.getTime() > Date.now() - 600_000;
        const oauthState = new URL(request.url).searchParams.get("state");
        const linkProof =
          path === "/callback/google" && oauthState
            ? await tx.verification.findFirst({
                where: { identifier: emailKey(secret, "google-link", oauthState) },
              })
            : null;
        if (linkProof) {
          const binding = JSON.parse(linkProof.value);
          if (
            !fresh ||
            !user ||
            linkProof.expiresAt <= new Date() ||
            binding.userId !== user.id ||
            binding.sessionId !== session?.id ||
            binding.version !== user.operationsVersion
          )
            return failed(403, "recent_auth_required");
          security.googleLinkEmail = user.email;
        }

        const management =
          (path.startsWith("/security/") && path !== "/security/status") || path === "/link-social";
        if (path.startsWith("/security/") || path === "/link-social") {
          if (!user?.emailVerified) return failed(401);
          if (management && !fresh) return failed(403, "recent_auth_required");
          const limitKey = emailKey(secret, "security-write", user.id);
          if (management) {
            const rows = await tx.$queryRaw<
              Array<{ count: number }>
            >`INSERT INTO request_budgets(key,count,expires_at) VALUES(${limitKey},1,clock_timestamp()+interval '10 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN request_budgets.expires_at<=clock_timestamp() THEN 1 ELSE request_budgets.count+1 END, expires_at=CASE WHEN request_budgets.expires_at<=clock_timestamp() THEN clock_timestamp()+interval '10 minutes' ELSE request_budgets.expires_at END WHERE request_budgets.expires_at<=clock_timestamp() OR request_budgets.count<30 RETURNING count`;
            if (!rows.length) return failed(429, "too_many_requests");
          }
        }
        if (path === "/security/status" && user)
          return json({
            data: {
              totp: user.twoFactorEnabled,
              fresh,
              verifiedAt: session?.verifiedAt?.toISOString() ?? null,
              passkeys: await tx.passkey.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: "asc" },
                select: { id: true, name: true, createdAt: true },
              }),
              google: !!google,
              googleLinked: !!(await tx.account.findFirst({
                where: { userId: user.id, providerId: "google" },
              })),
            },
          });
        let native = path;
        let method = request.method;
        let nativeBody = body;
        const allowed = path.endsWith("/remove")
          ? ["id", "confirm"]
          : path.endsWith("/confirm") || path.startsWith("/two-factor/verify-")
            ? ["code"]
            : path.endsWith("/verify")
              ? ["response", "name"]
              : path === "/passkey/verify-authentication"
                ? ["response"]
                : path === "/sign-in/social" || path === "/link-social"
                  ? ["provider", "callbackURL", "errorCallbackURL", "disableRedirect"]
                  : [];
        if (request.method === "POST" && Object.keys(body).some((k) => !allowed.includes(k)))
          return failed();
        if (path === "/sign-in/social" || path === "/link-social") {
          if (!google || body.provider !== "google") return failed();
          // OAuth may resume only through app-owned pages; caller redirects cannot move credentials.
          nativeBody = {
            provider: "google",
            callbackURL: `${origin}${path === "/link-social" ? "/settings/security?notice=google-linked" : "/sign-in/complete"}`,
            errorCallbackURL: `${origin}/sign-in?notice=google-failed`,
            disableRedirect: true,
          };
        }
        if (path === "/callback/google" && !google) return failed(404);
        const passkeys = user ? await tx.passkey.count({ where: { userId: user.id } }) : 0;
        const oldFactor = user
          ? await tx.twoFactor.findUnique({ where: { userId: user.id } })
          : null;
        if (path === "/security/passkey/options") {
          if (passkeys >= 10) return failed(409);
          native = "/passkey/generate-register-options";
          method = "GET";
        }
        if (path === "/passkey/generate-authenticate-options") method = "GET";
        if (path === "/security/passkey/verify") {
          if (
            passkeys >= 10 ||
            (body.name !== undefined &&
              (typeof body.name !== "string" || body.name.trim().length > 100))
          )
            return failed();
          native = "/passkey/verify-registration";
        }
        if (path === "/security/passkey/remove") {
          if (body.confirm !== true || typeof body.id !== "string") return failed();
          native = "/passkey/delete-passkey";
          nativeBody = { id: body.id };
        }
        if (path === "/security/google/remove" && user) {
          if (body.confirm !== true) return failed();
          await tx.account.deleteMany({ where: { userId: user.id, providerId: "google" } });
          await changed();
          return json({ success: true });
        }
        if (path === "/security/totp/start") {
          if (user?.twoFactorEnabled) return failed(409);
          native = "/two-factor/enable";
          nativeBody = {};
        }
        if (path === "/security/totp/confirm") {
          if (!oldFactor || oldFactor.verified) return failed();
          native = "/two-factor/verify-totp";
        }
        if (path === "/security/totp/remove") {
          if (body.confirm !== true || !user?.twoFactorEnabled) return failed();
          native = "/two-factor/disable";
          nativeBody = {};
        }
        if (path === "/security/recovery/rotate") {
          if (!user?.twoFactorEnabled && !passkeys) return failed();
          native = user?.twoFactorEnabled
            ? "/two-factor/generate-backup-codes"
            : "/two-factor/enable";
        }
        if (
          native === "/two-factor/verify-totp" &&
          (typeof body.code !== "string" || !/^\d{6}$/.test(body.code))
        )
          return failed();
        if (
          native === "/two-factor/verify-backup-code" &&
          (typeof body.code !== "string" || !/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(body.code))
        )
          return failed();
        const headers = new Headers(request.headers);
        headers.set(
          "cookie",
          (headers.get("cookie") ?? "")
            .split(";")
            .filter(
              (part) =>
                !part.includes("better-auth.trust_device=") &&
                !(management && part.includes("better-auth.two_factor=")),
            )
            .join(";"),
        );
        headers.delete("content-length");
        headers.set("content-type", "application/json");
        if (path.startsWith("/two-factor/")) {
          // A pending login must never fall back to an existing session's factor.
          headers.delete("authorization");
          headers.set(
            "cookie",
            (headers.get("cookie") ?? "")
              .split(";")
              .filter((part) => !/(?:^|\s)(?:__Secure-)?better-auth\.session/.test(part))
              .join(";"),
          );
        }
        const target = new URL(root + native, baseURL);
        if (path === "/callback/google") target.search = new URL(request.url).search;
        const response = await auth.handler(
          new Request(target, {
            method,
            headers,
            ...(method === "POST" ? { body: JSON.stringify(nativeBody) } : {}),
          }),
        );
        if (security.rejected) throw appError("unauthorized");
        if (response.status >= 500) throw appError("service_unavailable");
        if (!response.ok && response.status !== 302) {
          response.headers.delete("set-cookie");
          response.headers.delete("set-auth-token");
          return response;
        }
        let payload: Record<string, unknown> | null =
          response.status === 200 ? await response.clone().json() : null;

        if (path === "/link-social" && user && session && typeof payload?.url === "string") {
          const state = new URL(payload.url).searchParams.get("state");
          if (!state) throw appError("service_unavailable");
          await tx.verification.create({
            data: {
              identifier: emailKey(secret, "google-link", state),
              value: JSON.stringify({
                userId: user.id,
                sessionId: session.id,
                version: user.operationsVersion,
              }),
              expiresAt: new Date(Date.now() + 600_000),
            },
          });
        }
        if (linkProof) {
          await tx.verification.delete({ where: { id: linkProof.id } });
          if (
            response.headers.get("location") === `${origin}/settings/security?notice=google-linked`
          )
            await changed();
        }
        if (path === "/security/passkey/verify" && user && !oldFactor) {
          const result = await auth.handler(
            new Request(new URL(`${root}/two-factor/enable`, baseURL), {
              method: "POST",
              headers,
              body: "{}",
            }),
          );
          if (!result.ok) throw appError("service_unavailable");
          payload = { ...payload, backupCodes: (await result.json()).backupCodes };
        }
        if (path === "/security/totp/remove" && passkeys && oldFactor)
          await tx.twoFactor.create({
            data: {
              userId: oldFactor.userId,
              secret: oldFactor.secret,
              backupCodes: oldFactor.backupCodes,
              verified: false,
            },
          });
        if (management && !["/security/passkey/options", "/link-social"].includes(path))
          await changed(response);
        if (path === "/security/recovery/rotate") payload = { backupCodes: payload?.backupCodes };
        await options.beforeCommit?.();
        if (payload)
          return Response.json(payload, { status: response.status, headers: response.headers });
        response.headers.set("Cache-Control", "no-store");
        return response;
        async function changed(response?: Response) {
          if (!user || !session) throw appError("unauthorized");
          // Enrollment may rotate the current session inside the library.
          const active = await tx.session.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "desc" },
          });
          const keep = response?.headers.get("set-cookie")?.includes("session_token=")
            ? active?.id
            : session.id;
          await tx.session.deleteMany({ where: { userId: user.id, id: { not: keep } } });
          if (keep)
            await tx.session.updateMany({
              where: { id: keep },
              data: {
                verifiedAt: session.verifiedAt,
                authenticationMethod: session.authenticationMethod,
              },
            });
          await invalidateSecurityChallenges(tx, user.id);
          await tx.auditLog.create({
            data: {
              category: "authentication",
              actorKind: "user",
              actorUserId: user.id,
              targetUserId: user.id,
              action: path.slice(1).replaceAll("/", "."),
              outcome: "success",
            },
          });
        }
      },
      { maxWait: 5000, timeout: 20000 },
    );
  } catch (error) {
    return error instanceof AppException
      ? failed(error.getStatus(), error.code)
      : failed(503, "service_unavailable");
  }
}
