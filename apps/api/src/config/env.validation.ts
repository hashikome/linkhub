import { publicOrigins } from "@ntumie/config/public-origins";
// Startup configuration validation (plain function — no schema dependency).
// Every variable stays optional with in-code local defaults; validation only
// rejects values that are present but malformed, so a bad deployment fails
// fast instead of half-working. Secret-bearing values are resolved through
// the _FILE contract (readSecret) so file-delivered secrets get the same
// checks as plain env vars — the production path must not bypass validation.

import { googleCredentials } from "../auth/security-config";
import { trustedProxies } from "../common/middleware/request-budget";
import { emailConfig } from "../email/config";
import { readSecret } from "./secret";
import { telemetryConfig } from "./telemetry";

function isPort(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const env = config as Record<string, string | undefined>;
  telemetryConfig(env);
  googleCredentials(env);
  publicOrigins(env);
  trustedProxies(env.TRUSTED_PROXY_CIDRS);

  // Zero-config is a development affordance only. In production the in-code
  // localhost defaults and the public dev auth secret are never acceptable:
  // refuse to boot rather than run half-configured.
  if (env.NODE_ENV === "production") {
    for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET"]) {
      if (readSecret(name, env) === undefined) {
        errors.push(`${name} (or ${name}_FILE) is required in production`);
      }
    }
    if (readSecret("BETTER_AUTH_SECRET", env) === "dev-better-auth-secret") {
      errors.push("BETTER_AUTH_SECRET must not be the dev default in production");
    }
  }

  const port = config.PORT;
  if (typeof port === "string" && port !== "" && !isPort(port)) {
    errors.push(`PORT must be a TCP port (1-65535), got "${port}"`);
  }

  const dbUrl = readSecret("DATABASE_URL", env);
  if (dbUrl !== undefined && !/^postgres(ql)?:\/\//.test(dbUrl)) {
    errors.push("DATABASE_URL must be a postgresql:// URL");
  }

  const redisUrl = readSecret("REDIS_URL", env);
  if (redisUrl !== undefined && !/^rediss?:\/\//.test(redisUrl)) {
    errors.push("REDIS_URL must be a redis:// or rediss:// URL");
  }

  const secret = readSecret("BETTER_AUTH_SECRET", env);
  if (secret !== undefined && secret.length < 16) {
    errors.push("BETTER_AUTH_SECRET must be at least 16 characters");
  }

  const baseUrl = config.BETTER_AUTH_URL;
  if (typeof baseUrl === "string" && baseUrl !== "" && !/^https?:\/\//.test(baseUrl)) {
    errors.push("BETTER_AUTH_URL must be an http(s) URL");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join("\n- ")}`);
  }

  emailConfig(env);
  return config;
}
