// Deleting a variable does not isolate a Bun child: its cwd's .env files can
// supply it again. Empty inherited strings mask both Bun and dotenv loading,
// and readSecret treats an empty *_FILE as absent. Keep these through every
// migration, application, worker and nested test process.
export function maskVerificationOverrides<T extends Record<string, string | undefined>>(
  env: T,
): T & Record<string, string | undefined> {
  const isolated = { ...env } as T & Record<string, string | undefined>;
  for (const key of [
    "WEB_ORIGIN",
    "BOOTSTRAP_ADMIN_EMAIL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_ID_FILE",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET_FILE",
    "DATABASE_URL_FILE",
    "REDIS_URL_FILE",
    "BETTER_AUTH_SECRET_FILE",
    "EMAIL_SUPPRESSION_SECRET_FILE",
    "WEB_SOURCE_SECRET_FILE",
    "API_INTERNAL_ORIGIN_FILE",
    "RESEND_API_KEY",
    "RESEND_API_KEY_FILE",
    "RESEND_WEBHOOK_SECRET",
    "RESEND_WEBHOOK_SECRET_FILE",
    "SENTRY_DSN",
    "SENTRY_DSN_FILE",
    "TRUSTED_PROXY_CIDRS",
    "WEB_TRUSTED_PROXY_CIDRS",
  ])
    (isolated as Record<string, string | undefined>)[key] = "";
  // Unlike optional secrets, release validation rejects an empty string.
  (isolated as Record<string, string | undefined>).RELEASE_SHA = "0".repeat(40);
  return isolated;
}
