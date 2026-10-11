import { createServer } from "node:net";

// Ask Bun in the API's working directory so its .env, .env.development and
// .env.local precedence matches the child. Print only the port, never its env.
export async function resolveApiPort(cwd = "apps/api", env = process.env): Promise<number> {
  return resolvePort(cwd, env, "PORT", 4004);
}

export async function resolveWebPort(cwd = "apps/web", env = process.env): Promise<number> {
  return resolvePort(cwd, env, "WEB_PORT", 3004);
}

async function resolvePort(
  cwd: string,
  env: NodeJS.ProcessEnv,
  key: "PORT" | "WEB_PORT",
  fallback: number,
) {
  const child = Bun.spawn(["bun", "--print", `process.env.${key} ?? "${fallback}"`], {
    cwd,
    env: { ...env, NODE_ENV: "development" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const value = (await new Response(child.stdout).text()).trim();
  if ((await child.exited) !== 0) throw new Error(`Could not resolve ${key}`);
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid ${key}: expected a port from 1 to 65535`);
  return port;
}

export async function requireFreePort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid development port");
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          error.code === "EADDRINUSE"
            ? `Port ${port} is occupied; stop its server or explicitly override the port before starting dev.`
            : `Cannot bind development port ${port}: ${error.code ?? "unknown error"}`,
        ),
      );
    });
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}
