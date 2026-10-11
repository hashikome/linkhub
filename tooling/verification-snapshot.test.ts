import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshotWorkingTree } from "./verification-snapshot";

it("snapshots staged deletions and renames alongside current edits without changing the index", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "verification-snapshot-"));
  const source = join(fixture, "source"),
    target = join(fixture, "target");
  function git(...args: string[]) {
    const result = Bun.spawnSync(["git", "-C", source, ...args]);
    if (result.exitCode) throw new Error(result.stderr.toString());
    return result.stdout;
  }
  try {
    const initialized = Bun.spawnSync(["git", "init", "--quiet", source]);
    expect(initialized.exitCode).toBe(0);
    for (const name of [
      "staged-delete",
      "unstaged-delete",
      "rename-old",
      "edited",
      ".env",
      ".env.example",
    ])
      await writeFile(join(source, name), "original");
    await writeFile(join(source, ".gitignore"), "ignored\n");
    git("add", ".");
    git(
      "-c",
      "user.name=Snapshot test",
      "-c",
      "user.email=snapshot@example.com",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    );
    const cloned = Bun.spawnSync(["git", "clone", "--shared", "--quiet", source, target]);
    expect(cloned.exitCode).toBe(0);
    git("rm", "staged-delete");
    git("mv", "rename-old", "rename-new");
    await rm(join(source, "unstaged-delete"));
    await writeFile(join(source, "edited"), "staged content");
    git("add", "edited");
    await writeFile(join(source, "edited"), "current content");
    await writeFile(join(source, "untracked"), "new file");
    await writeFile(join(source, "ignored"), "excluded");
    await writeFile(join(source, ".env.local"), "excluded");
    const index = await readFile(join(source, ".git/index"));
    await snapshotWorkingTree(source, target);
    for (const name of [
      "staged-delete",
      "unstaged-delete",
      "rename-old",
      "ignored",
      ".env",
      ".env.local",
    ])
      expect(await Bun.file(join(target, name)).exists()).toBe(false);
    expect(await Bun.file(join(target, "rename-new")).text()).toBe("original");
    expect(await Bun.file(join(target, "edited")).text()).toBe("current content");
    expect(await Bun.file(join(target, "untracked")).text()).toBe("new file");
    expect(await Bun.file(join(target, ".env.example")).text()).toBe("original");
    expect(await readFile(join(source, ".git/index"))).toEqual(index);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
