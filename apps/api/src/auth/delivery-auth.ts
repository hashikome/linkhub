import { type SignInCodePurpose, signInCodePurposes } from "@nslinkhub/types";
import { emailOTP } from "better-auth/plugins";
import { AppException, appError } from "../common/errors/app-exception";
import { AUTHORITY_LOCK } from "../database/authority-context";
import { emailKey, enqueueEmail } from "../email/outbox";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { invitationCodeIdentifier } from "../operations/invitations";
import { acceptInvitation, previewInvitation, verificationContext } from "../operations/recipient";
import { accountActionContext, completeAccountAction } from "./account-lifecycle";
import { recoveryContext, recoveryCookie, stageRecovery } from "./account-recovery";
import { createAuth } from "./create-auth";
import {
  discardEmailRegistration,
  registrationCookie,
  registrationToken,
  stageEmailRegistration,
} from "./email-registration";
import {
  connectionCookieHeader,
  discardGoogleConnection,
  googleConnectionCookie,
  googleConnectionToken,
  pendingGoogleConnection,
} from "./google-connection";
import { bindProofIdentifiers } from "./handover-proofs";
import type { GoogleCredentials } from "./security-config";
import { securityHandler, securityPath } from "./security-handler";
import type { SecurityContext } from "./security-plugins";

const basePath = "/api/v1/auth";
const accountPaths = new Set(["/account/send", "/account/confirm"]);
const codePaths = new Set(["/code/send", "/code/verify"]);
const invitationPaths = new Set([
  "/invitations/preview",
  "/invitations/accept",
  "/invitations/verify",
  "/invitations/resend",
]);
const nativePaths = new Set([
  "/sign-out",
  "/revoke-session",
  "/revoke-sessions",
  "/revoke-other-sessions",
]);
const failure = (status: number, code = "invalid_request") =>
  Response.json(
    {
      error: {
        code,
        message:
          status === 503 ? "Service temporarily unavailable" : "Unable to complete this request",
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
function email(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? value.toLowerCase()
    : undefined;
}
// Minimum gap between two codes for one identity. A rejected request does not
// extend the wait; the response says exactly how long remains.
export const CODE_RESEND_SECONDS = 30;
async function cooldown(tx: Prisma.TransactionClient, key: string, seconds: number) {
  const claimed = await tx.$queryRaw<Array<{ count: number }>>`
    INSERT INTO request_budgets (key,count,expires_at) VALUES (${key},1,clock_timestamp()+make_interval(secs => ${seconds}))
    ON CONFLICT (key) DO UPDATE SET count=1, expires_at=clock_timestamp()+make_interval(secs => ${seconds})
    WHERE request_budgets.expires_at <= clock_timestamp() RETURNING count`;
  if (claimed.length) return 0;
  const [row] = await tx.$queryRaw<Array<{ remaining: number }>>`
    SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM expires_at - clock_timestamp())))::int AS remaining
    FROM request_budgets WHERE key = ${key}`;
  return row?.remaining ?? seconds;
}
const coolingDown = (seconds: number) =>
  Response.json(
    { error: { code: "too_many_requests", message: "Unable to complete this request" } },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(seconds) } },
  );
async function budget(tx: Prisma.TransactionClient, key: string, limit: number) {
  const rows = await tx.$queryRaw<Array<{ count: number }>>`
    INSERT INTO request_budgets (key,count,expires_at) VALUES (${key},1,clock_timestamp()+interval '10 minutes')
    ON CONFLICT (key) DO UPDATE SET
      count=CASE WHEN request_budgets.expires_at <= clock_timestamp() THEN 1 ELSE request_budgets.count+1 END,
      expires_at=CASE WHEN request_budgets.expires_at <= clock_timestamp() THEN clock_timestamp()+interval '10 minutes' ELSE request_budgets.expires_at END
    WHERE request_budgets.expires_at <= clock_timestamp() OR request_budgets.count < ${limit} RETURNING count`;
  return rows.length > 0;
}

export interface DeliveryAuthOptions {
  prisma: PrismaClient;
  google?: GoogleCredentials;
  secret: string;
  suppressionSecret: string;
  baseURL: string;
  webOrigin?: string;
  supportUrl: string;
  // Seconds between two sign-in codes for one address (default CODE_RESEND_SECONDS).
  codeResendSeconds?: number;
  // Fault injection stays at the persistence boundary; never emits real mail.
  persistEmail?: typeof enqueueEmail;
  beforeCommit?: () => Promise<void>;
}
export function createDeliveryAuth(options: DeliveryAuthOptions) {
  const { prisma, secret, baseURL, supportUrl } = options;
  const webOrigin = options.webOrigin ?? new URL(baseURL).origin;
  const resendGap = options.codeResendSeconds ?? CODE_RESEND_SECONDS;
  const ordinary = createAuth({ prisma, secret, baseURL, webOrigin, google: options.google });
  async function getSession(input: { headers: Headers }) {
    const session = await ordinary.api.getSession(input);
    if (!session) return null;
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accountState: true },
    });
    return user?.accountState === "active" ? session : null;
  }
  return {
    ...ordinary,
    api: { ...ordinary.api, getSession },
    handler: async (request: Request): Promise<Response> => {
      const url = new URL(request.url);
      const path = url.pathname.slice(basePath.length);
      if (securityPath(path)) return securityHandler(request, options);
      // Explicit HTTP allowlist: native OTP/verification/reset routes cannot bypass
      // purpose binding or durable delivery. No email GET endpoint consumes a challenge.
      if (request.method === "GET") {
        if (path !== "/get-session") return failure(404);
        const session = await getSession({ headers: request.headers });
        return session
          ? ordinary.handler(request)
          : Response.json(null, { headers: { "Cache-Control": "no-store" } });
      }
      let body: Record<string, unknown>;
      try {
        // Bound streaming input before JSON parsing (Content-Length is untrusted).
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        if (reader)
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > 16_384) {
              await reader.cancel();
              return failure(413);
            }
            chunks.push(value);
          }
        body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body)) return failure(400);
      } catch {
        return failure(400);
      }
      if (
        request.method !== "POST" ||
        (!codePaths.has(path) &&
          !nativePaths.has(path) &&
          !invitationPaths.has(path) &&
          !accountPaths.has(path))
      )
        return failure(404);
      const origin = request.headers.get("origin");
      if (
        (origin && origin !== webOrigin) ||
        (!origin && request.headers.has("cookie")) ||
        request.headers.get("sec-fetch-site") === "cross-site"
      )
        return failure(403);
      if (
        invitationPaths.has(path) &&
        (origin !== webOrigin || request.headers.has("authorization"))
      )
        return failure(403, "forbidden");
      let discardedConnection = false;
      let discardedRegistration = false;
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            // All auth mutations, including code session creation, share this
            // DB lock. Cross-process ordering is deliberate at this product's scale.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUTHORITY_LOCK}::bigint)`;
            const connectionToken = googleConnectionToken(request.headers, baseURL);
            if (
              registrationToken(request.headers, baseURL) &&
              ["/code/send", "/invitations/accept", "/invitations/resend"].includes(path)
            ) {
              await discardEmailRegistration(
                tx,
                secret,
                registrationToken(request.headers, baseURL),
              );
              discardedRegistration = true;
            }
            if (path === "/code/send") {
              if (body.googleConnection !== undefined && typeof body.googleConnection !== "boolean")
                return failure(400);
              // A fresh email flow replaces abandoned Google linking. Inline
              // Google proof explicitly continues its identity-bound flow.
              if (connectionToken && body.googleConnection !== true) {
                await discardGoogleConnection(tx, secret, connectionToken);
                discardedConnection = true;
              }
            }
            if (
              path.startsWith("/code/") &&
              !discardedConnection &&
              (connectionToken || body.googleConnection === true)
            ) {
              const pending = await pendingGoogleConnection(tx, secret, connectionToken);
              if (
                !pending?.user ||
                typeof body.email !== "string" ||
                body.email.trim().toLowerCase() !== pending.proof.email
              )
                return failure(400);
            }
            const signedIn = await localSession();
            async function localSession() {
              return createAuth({ prisma: tx, secret, baseURL, webOrigin }).api.getSession({
                headers: request.headers,
              });
            }
            if (
              signedIn &&
              !(await tx.user.findFirst({
                where: { id: signedIn.user.id, accountState: "active" },
              }))
            )
              return failure(401);
            let lifecycle: Awaited<ReturnType<typeof accountActionContext>> | undefined;
            if (accountPaths.has(path)) {
              if (
                Object.keys(body).some(
                  (key) =>
                    !["action", "email", ...(path.endsWith("confirm") ? ["code"] : [])].includes(
                      key,
                    ),
                )
              )
                return failure(400);
              if (
                path.endsWith("confirm") &&
                (typeof body.code !== "string" || !/^\d{8}$/.test(body.code))
              )
                return failure(400);
              lifecycle = await accountActionContext(tx, secret, body, signedIn);
              const sending = path.endsWith("send");
              if (sending) {
                const wait = await cooldown(
                  tx,
                  emailKey(secret, "issue-gap", lifecycle.address),
                  resendGap,
                );
                if (wait) return coolingDown(wait);
              }
              if (
                !(await budget(
                  tx,
                  emailKey(secret, sending ? "issue" : "verify", lifecycle.address),
                  sending ? 5 : 15,
                ))
              )
                return failure(429, "too_many_requests");
              if (!lifecycle.account)
                return sending
                  ? Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } })
                  : failure(400);
            }
            let deliveryFailed = false;
            const recovering =
              path.startsWith("/code/") && email(body.email)
                ? await recoveryContext(tx, secret, email(body.email) as string)
                : null;
            const awaitingCreation =
              path === "/code/verify" &&
              body.createAccount !== true &&
              !!email(body.email) &&
              !(await tx.user.findUnique({ where: { email: email(body.email) as string } }));
            let verifiedMissingEmail = false;
            let deliveryCount = 0;
            let invitationIdentifier: string | undefined;
            let emailPurpose: SignInCodePurpose = "sign-in";
            const security: SecurityContext = {
              proofOnly: !!lifecycle || !!recovering,
              invitationToken:
                path === "/invitations/verify" && typeof body.token === "string"
                  ? body.token
                  : undefined,
            };
            const localAuth = createAuth({
              security,
              prisma: tx,
              secret,
              baseURL,
              webOrigin,
              plugins: [
                emailOTP({
                  disableSignUp: awaitingCreation,
                  otpLength: 8,
                  expiresIn: 300,
                  allowedAttempts: 3,
                  resendStrategy: "rotate",
                  storeOTP: { hash: async (otp) => emailKey(secret, "otp", otp) },
                  changeEmail: { enabled: false },
                  sendVerificationOTP: async ({ email: to, otp, type }) => {
                    try {
                      if (type !== "sign-in") throw new Error("Unsupported email workflow");
                      const identifier =
                        lifecycle?.identifier ?? invitationIdentifier ?? `sign-in-otp-${to}`;
                      await (options.persistEmail ?? enqueueEmail)(tx, {
                        secret,
                        suppressionSecret: options.suppressionSecret,
                        supportUrl,
                        to,
                        code: otp,
                        kind: "sign-in",
                        identifier,
                        purpose:
                          lifecycle?.action ?? (invitationIdentifier ? "invitation" : emailPurpose),
                      });
                      deliveryCount++;
                    } catch {
                      deliveryFailed = true;
                      throw new Error("Delivery intent unavailable");
                    }
                  },
                }),
              ],
            });
            let acceptance: Awaited<ReturnType<typeof acceptInvitation>> | undefined;
            let verification: Awaited<ReturnType<typeof verificationContext>> | undefined;
            const verifyInvitation = path === "/invitations/verify";
            if (invitationPaths.has(path)) {
              if (path.endsWith("preview")) {
                if (Object.keys(body).some((k) => k !== "token")) throw appError("bad_request");
                return Response.json(await previewInvitation(tx, body.token, signedIn), {
                  headers: { "Cache-Control": "no-store" },
                });
              }
              if (
                typeof body.token !== "string" ||
                !(await budget(tx, emailKey(secret, "invitation-accept", body.token), 15))
              )
                throw appError("too_many_requests");
              const context = await localAuth.$context;
              if (path === "/invitations/accept") {
                acceptance = await acceptInvitation(tx, body, signedIn, (email, name) =>
                  context.internalAdapter.createUser({ email, name, emailVerified: false }),
                );
                if (!acceptance.issueCode) {
                  await options.beforeCommit?.();
                  return Response.json(
                    { email: acceptance.email, signedIn: false, state: acceptance.state },
                    { headers: { "Cache-Control": "no-store" } },
                  );
                }
              } else if (
                Object.keys(body).some(
                  (k) => !["token", ...(verifyInvitation ? ["code"] : [])].includes(k),
                )
              )
                throw appError("bad_request");
              verification = await verificationContext(tx, body.token, signedIn);
              invitationIdentifier = invitationCodeIdentifier(verification.invitation);
              bindProofIdentifiers(
                context,
                new Map([[`sign-in-otp-${verification.invitation.email}`, invitationIdentifier]]),
              );
              if (verifyInvitation) {
                if (typeof body.code !== "string" || !/^\d{8}$/.test(body.code))
                  throw appError("bad_request");
              } else {
                // Invitation acceptance/resend is its own email-proof flow.
                // It must neither finish nor be blocked by abandoned OAuth.
                if (connectionToken) {
                  await discardGoogleConnection(tx, secret, connectionToken);
                  discardedConnection = true;
                }
                if (
                  !(await budget(tx, emailKey(secret, "issue", verification.invitation.email), 5))
                )
                  throw appError("too_many_requests");
                acceptance ??= {
                  email: verification.invitation.email,
                  signedIn: false,
                  state: "verifying",
                  issueCode: true,
                };
              }
            }
            let nativePath = path;
            let nativeBody = body;
            let expectedDelivery = false;
            const issuing = path === "/code/send";
            if (codePaths.has(path)) {
              const allowed =
                path === "/code/send"
                  ? ["email", "purpose", "googleConnection"]
                  : ["email", "code", "name", "createAccount"];
              if (Object.keys(body).some((k) => !allowed.includes(k))) return failure(400);
              if (body.createAccount !== undefined && typeof body.createAccount !== "boolean")
                return failure(400);
              if (path === "/code/send" && body.purpose !== undefined) {
                if (!signInCodePurposes.some((purpose) => purpose === body.purpose))
                  return failure(400);
                emailPurpose = body.purpose as SignInCodePurpose;
              }
              if (!issuing && (typeof body.code !== "string" || !/^\d{8}$/.test(body.code)))
                return failure(400);
              if (
                body.name !== undefined &&
                (typeof body.name !== "string" ||
                  body.name.trim().length === 0 ||
                  body.name.length > 255)
              )
                return failure(400);
              const address = email(body.email);
              if (!address) return failure(400);
              if (issuing) {
                const wait = await cooldown(tx, emailKey(secret, "issue-gap", address), resendGap);
                if (wait) return coolingDown(wait);
              }
              const account = await tx.user.findUnique({
                where: { email: address },
                select: { accountState: true },
              });
              if (account && account.accountState !== "active" && !recovering) {
                if (
                  !(await budget(
                    tx,
                    emailKey(secret, issuing ? "issue" : "verify", address),
                    issuing ? 5 : 15,
                  ))
                )
                  return failure(429, "too_many_requests");
                return issuing
                  ? Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } })
                  : failure(400);
              }
              nativePath = issuing ? "/email-otp/send-verification-otp" : "/sign-in/email-otp";
              nativeBody = issuing
                ? { email: address, type: "sign-in" }
                : {
                    email: address,
                    otp: body.code,
                    ...(typeof body.name === "string" ? { name: body.name.trim() } : {}),
                  };
              expectedDelivery = issuing;
              if (
                !(await budget(
                  tx,
                  emailKey(secret, issuing ? "issue" : "verify", address),
                  issuing ? 5 : 15,
                ))
              )
                return failure(429, "too_many_requests");
            }
            if (verifyInvitation && verification) {
              nativePath = "/sign-in/email-otp";
              nativeBody = { email: verification.invitation.email, otp: body.code };
            }
            if (acceptance?.issueCode) {
              nativePath = "/email-otp/send-verification-otp";
              nativeBody = { email: acceptance.email, type: "sign-in" };
              expectedDelivery = true;
            }
            if (lifecycle) {
              bindProofIdentifiers(
                await localAuth.$context,
                new Map([[`sign-in-otp-${lifecycle.address}`, lifecycle.identifier]]),
              );
              expectedDelivery = path.endsWith("send");
              nativePath = expectedDelivery
                ? "/email-otp/send-verification-otp"
                : "/sign-in/email-otp";
              nativeBody = expectedDelivery
                ? { email: lifecycle.address, type: "sign-in" }
                : { email: lifecycle.address, otp: body.code };
            }
            if (awaitingCreation) {
              const context = await localAuth.$context;
              const find = context.internalAdapter.findUserByEmail.bind(context.internalAdapter);
              // Better Auth's signInEmailOTP atomically consumes OTP before this
              // lookup. disableSignUp prevents writes; this flag distinguishes
              // proved absence from the same generic invalid-OTP error on bad proof.
              context.internalAdapter.findUserByEmail = async (...args) => {
                const result = await find(...args);
                if (!result && args[0] === email(body.email)) verifiedMissingEmail = true;
                return result;
              };
            }
            const headers = new Headers(request.headers);
            if (recovering)
              bindProofIdentifiers(
                await localAuth.$context,
                new Map([
                  [`sign-in-otp-${recovering.address}`, `${recovering.identifier}:identify`],
                ]),
              );
            headers.set(
              "cookie",
              (headers.get("cookie") ?? "")
                .split(";")
                .filter(
                  (part) =>
                    !part.includes("better-auth.trust_device=") &&
                    !(
                      discardedConnection &&
                      part.trim().startsWith(`${googleConnectionCookie(baseURL)}=`)
                    ),
                )
                .join(";"),
            );
            headers.set("content-type", "application/json");
            headers.delete("content-length");
            const response = await localAuth.handler(
              new Request(new URL(basePath + nativePath, baseURL), {
                method: "POST",
                headers,
                body: JSON.stringify(nativeBody),
              }),
            );
            if (security.rejected) throw appError("unauthorized");
            if (awaitingCreation && verifiedMissingEmail && response.status === 400) {
              await discardEmailRegistration(
                tx,
                secret,
                registrationToken(request.headers, baseURL),
              );
              const token = await stageEmailRegistration(tx, secret, email(body.email) as string);
              await options.beforeCommit?.();
              return Response.json(
                { registrationRequired: true },
                {
                  headers: {
                    "Cache-Control": "no-store",
                    "Set-Cookie": registrationCookie(baseURL, token),
                  },
                },
              );
            }
            if (
              deliveryFailed ||
              (response.ok && expectedDelivery && deliveryCount !== 1) ||
              response.status >= 500
            )
              throw new Error("Auth transaction failed");
            if (recovering && path === "/code/verify" && response.ok) {
              const verified = await response.clone().json();
              if (!verified.token || verified.user?.id !== recovering.account?.id)
                throw appError("unauthorized");
              // This proof reveals the available recovery action, never signs in.
              await tx.session.deleteMany({ where: { token: verified.token } });
              const token = await stageRecovery(tx, secret, recovering);
              await tx.auditLog.create({
                data: {
                  category: "authentication",
                  actorKind: "user",
                  actorUserId: verified.user.id,
                  targetUserId: verified.user.id,
                  action: "account.recovery.identify",
                  outcome: "success",
                },
              });
              await options.beforeCommit?.();
              return Response.json(
                { accountRecovery: true },
                {
                  headers: {
                    "Cache-Control": "no-store",
                    "Set-Cookie": recoveryCookie(baseURL, token),
                  },
                },
              );
            }
            if (lifecycle && path.endsWith("confirm")) {
              if (!response.ok) {
                await tx.auditLog.create({
                  data: {
                    category: "authentication",
                    actorKind: signedIn ? "user" : "anonymous",
                    actorUserId: signedIn?.user.id,
                    targetUserId: lifecycle.account?.id,
                    action: `account.${lifecycle.action}.confirm`,
                    outcome: "rejected",
                  },
                });
                return failure(response.status);
              }
              const verified = (await response.clone().json()) as { user?: { id?: string } };
              if (verified.user?.id !== lifecycle.account?.id)
                throw new Error("Account proof mismatch");
              const result = await completeAccountAction(tx, secret, lifecycle);
              await options.beforeCommit?.();
              // The native proof endpoint issues a session; completion revokes it.
              // Never expose that session token/cookie to the client.
              return Response.json(result, { headers: { "Cache-Control": "no-store" } });
            }
            if (response.ok && (path === "/code/verify" || verifyInvitation)) {
              const verified = (await response.clone().json()) as {
                twoFactorRedirect?: boolean;
                token?: string;
                user?: { id?: string };
              };
              if (verified.twoFactorRedirect) {
                await options.beforeCommit?.();
                response.headers.set("Cache-Control", "no-store");
                response.headers.delete("set-auth-token");
                return response;
              }
              if (!verified.token || !verified.user?.id)
                throw new Error("Missing verified session");
              // A completed sign-in ends the resend wait for that address.
              const verifiedAddress = path === "/code/verify" ? email(body.email) : undefined;
              if (verifiedAddress)
                await tx.$executeRaw`DELETE FROM request_budgets WHERE key = ${emailKey(secret, "issue-gap", verifiedAddress)}`;
            }
            // Issuance/rejected proof are delivery evidence. Successful sign-in
            // is recorded only by completeAuthentication, after all factors.
            if (path === "/code/send" || (path === "/code/verify" && !response.ok)) {
              await tx.auditLog.create({
                data: {
                  category: "authentication",
                  actorKind: "anonymous",
                  action: path.slice(1).replaceAll("/", "."),
                  outcome: response.ok ? "success" : "rejected",
                },
              });
            }
            if (acceptance && !response.ok) throw appError("service_unavailable");
            await options.beforeCommit?.();
            if (acceptance)
              return Response.json(
                { email: acceptance.email, signedIn: false, state: acceptance.state },
                { headers: { "Cache-Control": "no-store" } },
              );
            if (!response.ok && (codePaths.has(path) || verifyInvitation))
              return failure(response.status);
            response.headers.set("Cache-Control", "no-store");
            return response;
          },
          { maxWait: 5000, timeout: 15000 },
        );
        // Emit cancellation only after its database transaction committed.
        if (discardedRegistration) result.headers.append("set-cookie", registrationCookie(baseURL));
        if (discardedConnection)
          result.headers.append("set-cookie", connectionCookieHeader(baseURL));
        return result;
      } catch (error) {
        if (error instanceof AppException) return failure(error.getStatus(), error.code);
        return failure(503, "service_unavailable");
      }
    },
  };
}
