import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer } from "better-auth/plugins";
import { emitEvent } from "../common/observability/telemetry";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { accountUsername } from "../modules/users/account-onboarding";
import { authoritativeGoogleEmail, type GoogleCredentials } from "./security-config";
import { type SecurityContext, securityPlugins } from "./security-plugins";

export interface AuthDependencies {
  prisma: PrismaClient | Prisma.TransactionClient;
  secret: string;
  baseURL: string;
  /** Plugins and transaction-scoped persistence are supplied by the delivery composition. */
  plugins?: BetterAuthPlugin[];
  google?: GoogleCredentials;
  security?: SecurityContext;
}

export function createAuth({
  prisma,
  secret,
  baseURL,
  plugins = [],
  google,
  security = {},
}: AuthDependencies) {
  return betterAuth({
    logger: {
      log: (level) =>
        emitEvent(
          "auth.diagnostic",
          {},
          level === "error" ? "error" : level === "warn" ? "warn" : "info",
        ),
    },
    appName: "nslinkhub",
    onAPIError: { errorURL: `${new URL(baseURL).origin}/sign-in?notice=google-failed` },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        requireLocalEmailVerified: true,
        trustedProviders: [],
      },
    },
    socialProviders: google
      ? {
          google: {
            ...google,
            disableImplicitSignUp: true,
            disableSignUp: true,
            mapProfileToUser: (profile) => ({
              emailVerified:
                authoritativeGoogleEmail(profile) ||
                (profile.email_verified === true &&
                  security.googleLinkEmail === profile.email.toLowerCase()),
            }),
          },
        }
      : {},
    basePath: "/api/v1/auth",
    secret,
    baseURL,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // configureApp applies shared source budgets before every HTTP auth route;
    // delivery-auth adds shared identity budgets and the library's OTP attempt
    // cap. Do not add production-only, per-process/IP limits underneath them.
    rateLimit: { enabled: false },
    emailAndPassword: { enabled: false },
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email",
      "/change-password",
      "/set-password",
      "/request-password-reset",
      "/reset-password",
      "/forget-password",
    ],
    user: {
      deleteUser: { enabled: false },
      additionalFields: { username: { type: "string", required: false, input: false } },
    },
    advanced: {
      database: {
        // Let PostgreSQL generate uuid-v7 ids (app_uuid_v7 defaults).
        generateId: false,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, username: await accountUsername(prisma, user.name) },
          }),
        },
      },
    },
    plugins: [...plugins, ...securityPlugins(prisma, secret, baseURL, security), bearer()],
  });
}
