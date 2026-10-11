import { cp, lstat, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

// Overlay the working tree onto a fresh clone of HEAD, including staged and
// unstaged deletions. Index contents never replace the files being reviewed.
export async function snapshotWorkingTree(root: string, temporary: string) {
  const listing = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root },
  );
  if (listing.exitCode) throw new Error("Cannot enumerate the working tree");
  // The index omits staged deletions, but the clone still contains HEAD's files.
  const head = Bun.spawnSync(["git", "ls-tree", "-r", "--name-only", "-z", "HEAD"], { cwd: root });
  if (head.exitCode) throw new Error("Cannot enumerate HEAD");
  const files = [
    ...new Set(`${head.stdout.toString()}${listing.stdout.toString()}`.split("\0").filter(Boolean)),
  ];
  for (const path of files) {
    if (
      path
        .split("/")
        .some((part) => part === ".env" || (part.startsWith(".env.") && !part.endsWith(".example")))
    ) {
      await rm(join(temporary, path), { force: true });
      continue;
    }
    const source = join(root, path),
      target = join(temporary, path);
    const info = await lstat(source).catch(() => null);
    if (!info) {
      await rm(target, { force: true });
      continue;
    }
    if (!info.isFile()) throw new Error(`Verification source must be a regular file: ${path}`);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target);
  }
}
