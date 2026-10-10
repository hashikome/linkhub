import { expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { maskVerificationOverrides } from "./verification-env";

for (const mode of ["development", "test"]) {
  it(`masks conflicting API-local files through ${mode} child processes`, async () => {
    const root = await mkdtemp(join(tmpdir(), "verification-env-"));
    try {
      const api = join(root, "apps/api");
      const web = join(root, "apps/web");
      await mkdir(api, { recursive: true });
      await mkdir(web, { recursive: true });
      const secretFile = join(root, "conflicting-secret");
      await writeFile(secretFile, "postgresql://sentinel@127.0.0.1:1/persistent_sentinel");
      const overrides = {
        DATABASE_URL_FILE: secretFile,
        REDIS_URL_FILE: secretFile,
        BETTER_AUTH_SECRET_FILE: secretFile,
        EMAIL_SUPPRESSION_SECRET_FILE: secretFile,
        API_INTERNAL_ORIGIN_FILE: secretFile,
        WEB_SOURCE_SECRET_FILE: secretFile,
        RESEND_API_KEY_FILE: secretFile,
        RESEND_WEBHOOK_SECRET_FILE: secretFile,
        SENTRY_DSN_FILE: secretFile,
        SENTRY_DSN: "https://synthetic@telemetry.invalid/1",
        TRUSTED_PROXY_CIDRS: "192.0.2.1",
        WEB_TRUSTED_PROXY_CIDRS: "192.0.2.1",
        EMAIL_PROVIDER: "resend",
        BOOTSTRAP_ADMIN_EMAIL: "sentinel@example.invalid",
        QUEUE_NAMESPACE: "persistent-queue",
        DATABASE_URL: "postgresql://sentinel@127.0.0.1:1/persistent_plain",
      };
      const contents = Object.entries(overrides)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
      for (const cwd of [root, api, web])
        for (const file of [".env", ".env.local", `.env.${mode}`, ".env.production"])
          await writeFile(join(cwd, file), contents);

      // Prove the fixture reproduces the bug: absent inherited values are
      // loaded from API-local files. This probe never opens a connection.
      const unmasked = { ...process.env, NODE_ENV: mode };
      delete unmasked.DATABASE_URL_FILE;
      const control = Bun.spawn(["bun", "--print", "process.env.DATABASE_URL_FILE"], {
        cwd: api,
        env: unmasked,
        stdout: "pipe",
        stderr: "pipe",
      });
      expect((await new Response(control.stdout).text()).trim()).toBe(secretFile);
      expect(await control.exited).toBe(0);

      const env = maskVerificationOverrides({
        ...process.env,
        ...overrides,
        NODE_ENV: mode,
        DATABASE_URL: "postgresql://test@127.0.0.1:1/test_owned",
        REDIS_URL: "redis://127.0.0.1:6383",
        BETTER_AUTH_SECRET: "synthetic-test-auth-secret-only",
        EMAIL_SUPPRESSION_SECRET: "synthetic-test-suppression-secret-independent",
        WEB_SOURCE_SECRET: "synthetic-test-source-secret-independent",
        API_INTERNAL_ORIGIN: "http://127.0.0.1:4100",
        BETTER_AUTH_URL: "http://localhost:3100",
        EMAIL_PROVIDER: "capture",
        QUEUE_NAMESPACE: "test-isolated-queue",
      });
      async function probe(stage: string) {
        const child = Bun.spawn(
          ["bun", resolve(import.meta.dir, "fixtures/verification-env-child.ts"), "root", stage],
          {
            cwd: root,
            env,
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const output = await new Response(child.stdout).text();
        const errors = await new Response(child.stderr).text();
        if (child.exitCode !== null && child.exitCode !== 0) throw new Error(errors);
        expect(await child.exited).toBe(0);
        return JSON.parse(output);
      }
      expect(await probe("api")).toEqual({
        database: env.DATABASE_URL,
        workerDatabase: env.DATABASE_URL,
        redis: env.REDIS_URL,
        auth: env.BETTER_AUTH_SECRET,
        suppression: env.EMAIL_SUPPRESSION_SECRET,
        provider: "capture",
        queue: env.QUEUE_NAMESPACE,
        apiKey: null,
        webhookSecret: null,
        telemetry: null,
        databaseFile: "",
        trustedProxies: "",
        bootstrapAdmin: "",
      });
      expect(await probe("api-parent")).toEqual({
        authOrigin: env.BETTER_AUTH_URL,
        apiOrigin: env.API_INTERNAL_ORIGIN,
        publicOrigin: env.BETTER_AUTH_URL,
        sourceSecret: env.WEB_SOURCE_SECRET,
        trustedProxies: [],
        codeResendSeconds: 30,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
