import { passkey } from "@better-auth/passkey";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { twoFactor } from "better-auth/plugins";
import { emailKey } from "../email/outbox";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { completeAuthentication } from "./complete-authentication";
import {
  type GoogleIdentity,
  googleConnectionCookie,
  googleConnectionCookieOptions,
  googleConnectionToken,
  pendingGoogleConnection,
} from "./google-connection";

type Store = PrismaClient | Prisma.TransactionClient;
export interface SecurityContext {
  proofOnly?: boolean;
  /** Credential enrollment can rotate a session without completing a new login. */
  sessionMaintenance?: boolean;
  emailRegistration?: { email: string };
  registrationHubName?: string;
  invitationToken?: string;
  googleLinkEmail?: string;
  googleIdentity?: GoogleIdentity;
  googleEmailMismatch?: boolean;
  /** Backend validated consent and account absence under the authority lock. */
  googleRegistration?: GoogleIdentity;
  passkeyEmail?: string;
  passkeyBinding?: { email: string; userId: string | null; version: number | null };
  rejected?: boolean;
}
const denied = () =>
  new APIError("UNAUTHORIZED", { message: "Authentication could not be completed" });
export const factorCookieName = (baseURL: string) =>
  `${baseURL.startsWith("https:") ? "__Secure-" : ""}better-auth.two_factor`;

export function securityPlugins(
  prisma: Store,
  secret: string,
  baseURL: string,
  flow: SecurityContext = {},
  webOrigin = new URL(baseURL).origin,
): BetterAuthPlugin[] {
  const reject = () => {
    flow.rejected = true;
    return denied();
  };
  const factor = twoFactor({
    issuer: "nslinkhub",
    allowPasswordless: true,
    skipVerificationOnEnable: false,
    twoFactorCookieMaxAge: 600,
  });
  const gate = factor.hooks?.after?.[0];
  if (!gate || factor.hooks.after.length !== 1)
    throw new Error("Review the Better Auth factor gate after a dependency change");
  const gated: BetterAuthPlugin = {
    ...factor,
    hooks: {
      after: [
        {
          matcher: (ctx) =>
            !flow.proofOnly &&
            ["/sign-in/email-otp", "/sign-in/social", "/callback/:id", "/callback/google"].includes(
              ctx.path ?? "",
            ),
          handler: async (input) => {
            const ctx = input as GenericEndpointContext;
            const data = ctx.context.newSession;
            if (!data) return gate.handler(ctx);
            const user = await prisma.user.findUnique({ where: { id: data.user.id } });
            if (user?.accountState !== "active" || !user.emailVerified) throw reject();
            if (
              ["/sign-in/social", "/callback/:id", "/callback/google"].includes(ctx.path ?? "") &&
              flow.googleIdentity?.email !== user.email
            ) {
              flow.googleEmailMismatch = true;
              throw reject();
            }
            if (
              !user.twoFactorEnabled &&
              !(await prisma.passkey.count({ where: { userId: user.id } }))
            )
              return gate.handler(ctx);
            // Reuse the library's pending-session deletion and signed challenge mechanism.
            // A registered passkey protects email/Google fallback even without TOTP.
            data.user.twoFactorEnabled = true;
            const originalCreate = ctx.context.internalAdapter.createVerificationValue.bind(
              ctx.context.internalAdapter,
            );
            ctx.context.internalAdapter.createVerificationValue = async (value) => {
              const result = await originalCreate(value);
              if (
                value.identifier.startsWith("2fa-") &&
                !value.identifier.startsWith("2fa-attempts-")
              ) {
                await originalCreate({
                  identifier: `security-context:${value.identifier}`,
                  expiresAt: value.expiresAt,
                  value: await symmetricEncrypt({
                    key: secret,
                    data: JSON.stringify({
                      userId: user.id,
                      version: user.operationsVersion,
                      invitationToken: flow.invitationToken,
                    }),
                  }),
                });
              }
              return result;
            };
            const result = (await gate.handler(ctx)) as unknown as {
              response: unknown;
              headers: Headers;
            };
            // OAuth's native endpoint redirects; a pending factor must redirect to our challenge page.
            if (ctx.path === "/callback/:id" || ctx.path === "/callback/google") {
              result.headers.set("location", `${webOrigin}/sign-in/factor`);
              result.response = new APIError("FOUND", undefined, {
                location: `${webOrigin}/sign-in/factor`,
              });
            }
            return result;
          },
        },
      ],
    },
  };
  const webauthn = passkey({
    rpID: new URL(webOrigin).hostname,
    rpName: "nslinkhub",
    origin: webOrigin,
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    registration: {
      afterVerification: async ({ verification }) => {
        if (!verification.registrationInfo?.userVerified) throw reject();
      },
    },
    authentication: {
      afterVerification: async ({ verification }) => {
        if (!verification.authenticationInfo.userVerified) throw reject();
      },
    },
  });
  const policy: BetterAuthPlugin = {
    id: "account-security-policy",
    endpoints: {
      registerEmailAccount: createAuthEndpoint(
        "/email-registration/confirm",
        { method: "POST" },
        async (ctx) => {
          const identity = flow.emailRegistration;
          if (!identity) throw reject();
          return registerVerifiedAccount(ctx, identity.email, "");
        },
      ),
      registerGoogleAccount: createAuthEndpoint(
        "/google-connection/register",
        { method: "POST" },
        async (ctx) => {
          const identity = flow.googleRegistration;
          if (!identity) throw reject();
          return registerVerifiedAccount(ctx, identity.email, identity.name || "New member");
        },
      ),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) =>
            ctx.path === "/passkey/generate-authenticate-options" ||
            ctx.path === "/passkey/verify-authentication",
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.path === "/passkey/generate-authenticate-options" && flow.passkeyEmail) {
              const selected = await prisma.user.findUnique({
                where: { email: flow.passkeyEmail },
              });
              const binding = {
                email: flow.passkeyEmail,
                userId: selected?.id ?? null,
                version: selected?.operationsVersion ?? null,
              };
              const create = ctx.context.internalAdapter.createVerificationValue.bind(
                ctx.context.internalAdapter,
              );
              ctx.context.internalAdapter.createVerificationValue = (value) =>
                create({
                  ...value,
                  value: JSON.stringify({ ...JSON.parse(value.value), signInBinding: binding }),
                });
            }
            if (ctx.path === "/passkey/verify-authentication") {
              const consume = ctx.context.internalAdapter.consumeVerificationValue.bind(
                ctx.context.internalAdapter,
              );
              ctx.context.internalAdapter.consumeVerificationValue = async (token) => {
                const record = await consume(token);
                if (record) flow.passkeyBinding = JSON.parse(record.value).signInBinding;
                return record;
              };
            }
          }),
        },
        {
          matcher: (ctx) => ctx.path === "/two-factor/verify-totp",
          handler: createAuthMiddleware(async (ctx) => {
            const challenge = await ctx.getSignedCookie(factorCookieName(baseURL), secret);
            const pending = challenge
              ? await prisma.verification.findFirst({
                  where: { identifier: challenge, expiresAt: { gt: new Date() } },
                })
              : null;
            const userId = pending?.value ?? ctx.context.session?.user.id;
            if (userId && typeof ctx.body?.code === "string") {
              const key = `totp-used:${userId}:${emailKey(secret, "totp-replay", ctx.body.code)}`;
              if (
                await prisma.verification.findFirst({
                  where: { identifier: key, expiresAt: { gt: new Date() } },
                })
              )
                throw reject();
            }
          }),
        },
      ],
      after: [
        {
          matcher: () => !flow.proofOnly,
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.path === "/passkey/generate-authenticate-options") {
              const result = ctx.context.returned as Record<string, unknown>;
              return ctx.json({ ...result, userVerification: "required" });
            }
            const method =
              ctx.path === "/passkey/verify-authentication"
                ? "passkey"
                : ctx.path === "/two-factor/verify-totp"
                  ? "totp"
                  : ctx.path === "/two-factor/verify-backup-code"
                    ? "recovery"
                    : [
                          "/callback/:id",
                          "/callback/google",
                          "/sign-in/social",
                          "/google-connection/register",
                        ].includes(ctx.path ?? "")
                      ? "google"
                      : ["/sign-in/email-otp", "/email-registration/confirm"].includes(
                            ctx.path ?? "",
                          )
                        ? "email"
                        : null;
            const session = ctx.context.newSession;
            if (!session || !method) return;
            let invitationToken = flow.invitationToken;
            const user = await prisma.user.findUnique({ where: { id: session.user.id } });
            if (user?.accountState !== "active" || !user.emailVerified) throw reject();
            if (
              method === "passkey" &&
              flow.passkeyBinding &&
              (flow.passkeyBinding.userId !== user.id ||
                flow.passkeyBinding.email !== user.email ||
                flow.passkeyBinding.version !== user.operationsVersion)
            )
              throw reject();
            if (["passkey", "totp", "recovery"].includes(method)) {
              const challenge = await ctx.getSignedCookie(factorCookieName(baseURL), secret);
              if (challenge) {
                const record = await prisma.verification.findFirst({
                  where: {
                    identifier: `security-context:${challenge}`,
                    expiresAt: { gt: new Date() },
                  },
                });
                if (!record) throw reject();
                const pending = JSON.parse(
                  await symmetricDecrypt({ key: secret, data: record.value }),
                );
                if (pending.userId !== user.id || pending.version !== user.operationsVersion)
                  throw reject();
                invitationToken = pending.invitationToken;
                await prisma.verification.deleteMany({
                  where: {
                    identifier: {
                      in: [challenge, `security-context:${challenge}`, `2fa-attempts-${challenge}`],
                    },
                  },
                });
                ctx.setCookie(factorCookieName(baseURL), "", {
                  path: "/",
                  maxAge: 0,
                  httpOnly: true,
                  sameSite: "lax",
                  secure: baseURL.startsWith("https:"),
                });
              } else if (method === "recovery") throw reject();
            }
            const connectionToken = ctx.headers && googleConnectionToken(ctx.headers, baseURL);
            if (connectionToken && !flow.sessionMaintenance) {
              const pending = await pendingGoogleConnection(
                prisma,
                secret,
                connectionToken,
                method === "google" && flow.googleRegistration ? user.id : undefined,
              );
              if (!pending || pending.user?.id !== user.id) throw reject();
              const existing = await prisma.account.findFirst({
                where: { providerId: "google", accountId: pending.proof.subject },
              });
              if (existing && existing.userId !== user.id) throw reject();
              if (!existing) {
                const connected = await ctx.context.internalAdapter.linkAccount({
                  providerId: "google",
                  accountId: pending.proof.subject,
                  userId: user.id,
                });
                if (!connected) throw reject();
              }
              await prisma.verification.delete({ where: { id: pending.record.id } });
              await prisma.auditLog.create({
                data: {
                  category: "authentication",
                  actorKind: "user",
                  actorUserId: user.id,
                  targetUserId: user.id,
                  action: "security.google.connect",
                  outcome: "success",
                },
              });
              ctx.setCookie(
                googleConnectionCookie(baseURL),
                "",
                googleConnectionCookieOptions(baseURL, 0),
              );
            }
            if (method === "totp" && typeof ctx.body?.code === "string")
              await prisma.verification.create({
                data: {
                  identifier: `totp-used:${user.id}:${emailKey(secret, "totp-replay", ctx.body.code)}`,
                  value: "used",
                  expiresAt: new Date(Date.now() + 90_000),
                },
              });
            if (!flow.sessionMaintenance)
              await completeAuthentication(prisma, {
                userId: user.id,
                sessionId: session.session.id,
                method,
                invitationToken,
              });
          }),
        },
      ],
    },
  };
  return [webauthn, gated, policy];

  // Identity is supplied only after the delivery boundary validates consent and
  // consumes the staged proof. Library lifecycle hooks invoke app onboarding.
  async function registerVerifiedAccount(ctx: GenericEndpointContext, email: string, name: string) {
    const user = await ctx.context.internalAdapter.createUser({ email, name, emailVerified: true });
    const session = await ctx.context.internalAdapter.createSession(user.id);
    if (!session) throw reject();
    await setSessionCookie(ctx, { session, user });
    return ctx.json({ token: session.token, user });
  }
}
