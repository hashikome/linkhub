import { expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireFreePort, resolveApiPort, resolveWebPort } from "./dev-config";

it("resolves API-local env files with Bun precedence and lets the shell win", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "dev-port-"));
  const env = { ...process.env };
  delete env.PORT;
  try {
    expect(await resolveApiPort(cwd, env)).toBe(4004);
    await writeFile(join(cwd, ".env"), "PORT=4100\n");
    expect(await resolveApiPort(cwd, env)).toBe(4100);
    await writeFile(join(cwd, ".env.development"), "PORT=4200\n");
    expect(await resolveApiPort(cwd, env)).toBe(4200);
    await writeFile(join(cwd, ".env.local"), "PORT=4300\n");
    expect(await resolveApiPort(cwd, env)).toBe(4300);
    expect(await resolveApiPort(cwd, { ...env, PORT: "4400" })).toBe(4400);
    await expect(resolveApiPort(cwd, { ...env, PORT: "invalid" })).rejects.toThrow();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it("resolves web-local env files before pinning the port and derived origins", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "web-port-"));
  const env = { ...process.env };
  delete env.WEB_PORT;
  try {
    expect(await resolveWebPort(cwd, env)).toBe(3004);
    await writeFile(join(cwd, ".env"), "WEB_PORT=3104\n");
    expect(await resolveWebPort(cwd, env)).toBe(3104);
    await writeFile(join(cwd, ".env.development"), "WEB_PORT=3204\n");
    expect(await resolveWebPort(cwd, env)).toBe(3204);
    await writeFile(join(cwd, ".env.local"), "WEB_PORT=3304\n");
    expect(await resolveWebPort(cwd, env)).toBe(3304);
    expect(await resolveWebPort(cwd, { ...env, WEB_PORT: "3404" })).toBe(3404);
    for (const value of ["", "0", "65536", "invalid"])
      await expect(resolveWebPort(cwd, { ...env, WEB_PORT: value })).rejects.toThrow();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it("refuses occupied ports before startup without stopping the existing listener", async () => {
  const occupied = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("existing"),
  });
  const spare = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const free = spare.port;
  await spare.stop(true);
  try {
    await expect(requireFreePort(occupied.port)).rejects.toThrow(
      `Port ${occupied.port} is occupied`,
    );
    for (const [api, web] of [
      [occupied.port, free],
      [free, occupied.port],
    ]) {
      const child = Bun.spawn(["bun", join(import.meta.dir, "dev.ts")], {
        env: { ...process.env, PORT: String(api), WEB_PORT: String(web) },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, output, error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(code).not.toBe(0);
      expect(error).toContain(`Port ${occupied.port} is occupied`);
      expect(output).not.toContain("Starting");
      expect(await (await fetch(`http://127.0.0.1:${occupied.port}`)).text()).toBe("existing");
    }
  } finally {
    await occupied.stop(true);
  }
});
