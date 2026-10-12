import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { requireFreePort, resolveApiPort, resolveWebPort } from "./dev-config";

const root = resolve(import.meta.dir, "..");
const builtWeb = process.argv.includes("--built-web");
// Pigfarm's pattern: infrastructure first, three host processes, fail together.
// Refuse occupied ports rather than terminate independently started processes.
const [apiPort, webPort] = await Promise.all([
  resolveApiPort(resolve(root, "apps/api")),
  resolveWebPort(resolve(root, "apps/web")),
]);
if (apiPort === webPort) throw new Error("API and web need different ports");
await Promise.all([requireFreePort(apiPort), requireFreePort(webPort)]);
const infra = Bun.spawn(["bun", "run", "infra:up"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (await infra.exited) process.exit(1);
const env = {
  ...process.env,
  NODE_ENV: "development",
  PORT: String(apiPort),
  WEB_PORT: String(webPort),
  WEB_SOURCE_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  WEB_SOURCE_SECRET_FILE: "",
  WEB_TRUSTED_PROXY_CIDRS: "",
  BETTER_AUTH_URL: `http://localhost:${apiPort}`,
  WEB_ORIGIN: `http://localhost:${webPort}`,
  API_INTERNAL_ORIGIN: `http://127.0.0.1:${apiPort}`,
  API_INTERNAL_ORIGIN_FILE: "",
};
const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  const deadline = setTimeout(() => {
    for (const child of children) {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {}
    }
    process.exit(code);
  }, 3000);
  Promise.all(
    children.map((child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => child.once("exit", () => resolve())),
    ),
  ).then(() => {
    clearTimeout(deadline);
    process.exit(code);
  });
}
console.log(`Starting API at http://localhost:${apiPort} and web at http://localhost:${webPort}.`);
for (const [name, workspace, script] of [
  ["api", "@ntumie/api", "start:dev"],
  ["worker", "@ntumie/api", "email:worker:dev"],
  ["web", "@ntumie/web", builtWeb ? "start" : "dev"],
] as const) {
  console.log(`Starting ${name}: bun run ${script}`);
  const child = spawn("bun", ["run", "--filter", workspace, script], {
    cwd: root,
    env: name === "web" && builtWeb ? { ...env, NODE_ENV: "production" } : env,
    stdio: "inherit",
    detached: true,
  });
  children.push(child);
  child.once("error", () => {
    console.error(`${name} could not start; stopping the development stack.`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${name} exited (${signal ?? code}); stopping the development stack.`);
      stop(code || 1);
    }
  });
}
process.once("SIGINT", () => stop(130));
process.once("SIGTERM", () => stop(143));
