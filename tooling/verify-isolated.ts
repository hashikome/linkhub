import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { snapshotWorkingTree } from "./verification-snapshot";

// Verify the current reviewed working tree without sharing .next, generated
// clients, env files or listeners with an active development checkout.
const root = resolve(import.meta.dir, "..");
const task = process.argv[2] ?? "verify";
if (!["verify", "test:browser", "test:dev"].includes(task))
  throw new Error("Expected verify, test:browser or test:dev");
// Diagnostics must survive removal of the owned build checkout.
const artifactDirectory = resolve(
  process.env.BROWSER_ARTIFACT_DIR ??
    join(root, "test-results/browser", new Date().toISOString().replaceAll(":", "-")),
);
if (task === "test:browser") await mkdir(artifactDirectory, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), "app-verification-"));
let child: ReturnType<typeof Bun.spawn> | undefined;
async function run(cmd: string[], cwd = temporary) {
  child = Bun.spawn(cmd, {
    cwd,
    env: {
      ...process.env,
      ...(task === "test:browser" ? { BROWSER_ARTIFACT_DIR: artifactDirectory } : {}),
    },
    stdout: "inherit",
    stderr: "inherit",
    detached: true,
  });
  const code = await child.exited;
  child = undefined;
  if (code) throw new Error(`Verification command failed (${code})`);
}
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  const active = child;
  if (active) {
    // Signal the owned process group so nested test runners can clean their
    // databases/listeners before this checkout is removed.
    try {
      process.kill(-active.pid, "SIGTERM");
    } catch {}
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        process.kill(-active.pid, 0);
      } catch {
        break;
      }
      if (Date.now() >= deadline) {
        try {
          process.kill(-active.pid, "SIGKILL");
        } catch {}
        break;
      }
      await Bun.sleep(100);
    }
    await active.exited;
  }
  await rm(temporary, { recursive: true, force: true });
  process.exit(code);
}
process.once("SIGINT", () => void stop(130));
process.once("SIGTERM", () => void stop(143));
try {
  await run(["git", "clone", "--shared", "--quiet", root, temporary]);
  await snapshotWorkingTree(root, temporary);
  // A shared clone can reference the original objects, but every artifact and
  // installed workspace link belongs to this temporary tree.
  await readFile(join(temporary, "bun.lock"));
  await run(["bun", "install", "--frozen-lockfile"]);
  await run(["bun", "run", task, ...process.argv.slice(3)]);
} finally {
  if (!stopping) await rm(temporary, { recursive: true, force: true });
}
