import { passkey } from "@better-auth/passkey";
import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { twoFactor } from "better-auth/plugins";
import { emailKey } from "../email/outbox";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { finishInvitation } from "../operations/recipient";

type Store = PrismaClient | Prisma.TransactionClient;
export interface SecurityContext {
  proofOnly?: boolean;
  invitationToken?: string;
  googleLinkEmail?: string;
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
              result.headers.set("location", `${new URL(baseURL).origin}/sign-in/factor`);
              result.response = new APIError("FOUND", undefined, {
                location: `${new URL(baseURL).origin}/sign-in/factor`,
              });
            }
            return result;
          },
        },
      ],
    },
  };
  const webauthn = passkey({
    rpID: new URL(baseURL).hostname,
    rpName: "nslinkhub",
    origin: new URL(baseURL).origin,
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
    hooks: {
      before: [
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
                    : ["/callback/:id", "/callback/google", "/sign-in/social"].includes(
                          ctx.path ?? "",
                        )
                      ? "google"
                      : ctx.path === "/sign-in/email-otp"
                        ? "email"
                        : null;
            const session = ctx.context.newSession;
            if (!session || !method) return;
            const user = await prisma.user.findUnique({ where: { id: session.user.id } });
            if (user?.accountState !== "active" || !user.emailVerified) throw reject();
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
                if (pending.invitationToken)
                  await finishInvitation(
                    prisma as Prisma.TransactionClient,
                    pending.invitationToken,
                    user.id,
                  );
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
            const now = new Date();
            await prisma.session.update({
              where: { id: session.session.id },
              data: { verifiedAt: now, authenticationMethod: method },
            });
            await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now } });
            if (method === "totp" && typeof ctx.body?.code === "string")
              await prisma.verification.create({
                data: {
                  identifier: `totp-used:${user.id}:${emailKey(secret, "totp-replay", ctx.body.code)}`,
                  value: "used",
                  expiresAt: new Date(Date.now() + 90_000),
                },
              });
            if (method !== "email")
              await prisma.auditLog.create({
                data: {
                  category: "authentication",
                  actorKind: "user",
                  actorUserId: user.id,
                  targetUserId: user.id,
                  action: `security.sign_in.${method}`,
                  outcome: "success",
                },
              });
          }),
        },
      ],
    },
  };
  return [webauthn, gated, policy];
}
