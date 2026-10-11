import { resolve } from "node:path";
import { withTestDatabase } from "./test-database";
import { maskVerificationOverrides } from "./verification-env";

const root = resolve(import.meta.dir, "..");
let child: ReturnType<typeof Bun.spawn> | undefined;
const env = maskVerificationOverrides({
  ...process.env,
  NODE_ENV: "test",
  EMAIL_PROVIDER: "capture",
  // Keep the resend gap real but short so journeys can resend without sleeping.
  AUTH_CODE_RESEND_SECONDS: "2",
  SUPPORT_EMAIL: "support@example.com",
  WEB_SOURCE_SECRET: "browser-source-secret-synthetic-only-32-chars",
  BETTER_AUTH_SECRET: "browser-test-secret-not-for-production",
  EMAIL_SUPPRESSION_SECRET: "browser-test-suppression-independent",
  QUEUE_NAMESPACE: `browser-${crypto.randomUUID()}`,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6383",
  API_INTERNAL_ORIGIN: "http://server-origin-canary.invalid",
  BUNDLE_SECRET_CANARY: "synthetic-server-secret-must-not-enter-client",
});
async function run(cmd: string[], cwd: string) {
  child = Bun.spawn(cmd, { cwd, env, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  child = undefined;
  if (code) throw new Error(`Browser verification command failed (${code})`);
}
await run(["bun", "run", "web:build"], root);
// Inspect emitted browser code, not server artifacts or source files.
const glob = new Bun.Glob("**/*.{js,html,json}");
let browserAssets = 0;
for await (const file of glob.scan(resolve(root, "apps/web/.next/static"))) {
  browserAssets += 1;
  const content = await Bun.file(resolve(root, "apps/web/.next/static", file)).text();
  if (
    [
      env.API_INTERNAL_ORIGIN,
      env.BUNDLE_SECRET_CANARY,
      env.BETTER_AUTH_SECRET,
      env.WEB_SOURCE_SECRET,
    ].some((value) => content.includes(value))
  )
    throw new Error("Server canary leaked into browser bundle");
}
if (!browserAssets) throw new Error("Production browser assets are missing");
console.log("Production browser bundle excludes server canaries.");
await withTestDatabase(
  async ({ url }) => {
    Object.assign(env, { DATABASE_URL: url });
    await run(["bunx", "prisma", "migrate", "deploy"], resolve(root, "apps/api"));
    await run(
      [
        "bun",
        "test",
        "./test/browser/reading.browser.ts",
        "./test/browser/browser-diagnostics.browser.ts",
        ...process.argv.slice(2),
      ],
      resolve(root, "apps/api"),
    );
  },
  async () => {
    if (!child) return;
    child.kill();
    const timer = setTimeout(() => child?.kill("SIGKILL"), 3000);
    await child.exited;
    clearTimeout(timer);
  },
);
