import { resolve } from "node:path";
import { requireFreePort } from "./dev-config";
import { withTestDatabase } from "./test-database";
import { maskVerificationOverrides } from "./verification-env";

const root = resolve(import.meta.dir, "..");
const allocated = process.argv.includes("--allocated");
const builtWeb = process.argv.includes("--built-web");
if (builtWeb) {
  const build = Bun.spawn(["bun", "run", "web:build"], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await build.exited) throw new Error("Production web build failed");
}
let child: ReturnType<typeof Bun.spawn> | undefined;
async function stop() {
  const current = child;
  if (!current) return;
  current.kill("SIGTERM");
  const timer = setTimeout(() => current.kill("SIGKILL"), 5000);
  await current.exited;
  clearTimeout(timer);
  child = undefined;
}
await withTestDatabase(async ({ url }) => {
  const api = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const web = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const apiPort = allocated ? 4004 : api.port,
    webPort = allocated ? 3004 : web.port;
  await api.stop(true);
  await web.stop(true);
  await Promise.all([requireFreePort(apiPort), requireFreePort(webPort)]);
  const env = maskVerificationOverrides({
    ...process.env,
    DATABASE_URL: url,
    PORT: String(apiPort),
    WEB_PORT: String(webPort),
    EMAIL_PROVIDER: "capture",
    BETTER_AUTH_SECRET: "dev-loop-check-secret-synthetic-only",
    EMAIL_SUPPRESSION_SECRET: "dev-loop-check-suppression-independent",
    QUEUE_NAMESPACE: `dev-loop-${crypto.randomUUID()}`,
    REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6383",
  });
  // The allocated run tests actual defaults, rather than injecting target ports.
  if (allocated) {
    delete env.PORT;
    delete env.WEB_PORT;
  }
  const migration = Bun.spawn(["bunx", "prisma", "migrate", "deploy"], {
    cwd: `${root}/apps/api`,
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  if (await migration.exited) throw new Error("Dev fixture migration failed");
  await Bun.write("/tmp/w3-dev-loop.log", "");
  await Bun.write("/tmp/w3-dev-loop-errors.log", "");
  child = Bun.spawn(["bun", "tooling/dev.ts", ...(builtWeb ? ["--built-web"] : [])], {
    cwd: root,
    env,
    stdout: Bun.file("/tmp/w3-dev-loop.log"),
    stderr: Bun.file("/tmp/w3-dev-loop-errors.log"),
  });
  let ready = false;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Dev orchestrator exited early");
    try {
      const response = await fetch(`http://localhost:${webPort}/discover`, {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok && (await response.text()).includes("No published collections yet.")) {
        ready = true;
        break;
      }
    } catch {}
    await Bun.sleep(250);
  }
  if (!ready) throw new Error("Dev web did not become ready");
  const landing = await fetch(`http://localhost:${webPort}/`);
  const example = (await landing.text()).match(
    /<figure\b[^>]*aria-label="Example collection"[^>]*>([\s\S]*?)<\/figure>/,
  )?.[1];
  const exampleLinks = [...(example ?? "").matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const resourceLinks = exampleLinks.filter((href) => href.startsWith("https://"));
  const itemLinks = exampleLinks.filter((href) => href.startsWith("/?item="));
  const copyButtons = [
    ...(example ?? "").matchAll(/<button\b[^>]*>Copy link to this item<\/button>/g),
  ];
  if (
    !landing.ok ||
    !example ||
    exampleLinks.length !== 4 ||
    resourceLinks.length !== 2 ||
    itemLinks.length !== 2 ||
    copyButtons.length !== 0 ||
    itemLinks.some((href) => {
      const link = new URL(href, "http://localhost");
      return link.hash !== `#item-${link.searchParams.get("item")}`;
    })
  )
    throw new Error(
      "Dev example must show resource titles and demo-only native item links, with no copy buttons before hydration",
    );
  const signIn = await fetch(`http://127.0.0.1:${webPort}/sign-in`);
  if (!signIn.ok || !(await signIn.text()).includes('action="/forms/email-start"'))
    throw new Error("Dev sign-in page did not render");
  const output = await Bun.file("/tmp/w3-dev-loop.log").text();
  if (!output.includes(`[web] Ready at http://localhost:${webPort}`))
    throw new Error("Dev web did not announce its ready URL");
  const direct = await fetch(`http://localhost:${apiPort}/api/v1/discover`, {
    headers: { Origin: `http://localhost:${webPort}` },
  });
  if (
    !direct.ok ||
    (await direct.json()).data.length !== 0 ||
    direct.headers.get("access-control-allow-origin") !== `http://localhost:${webPort}`
  )
    throw new Error("Direct API read or exact-origin CORS failed");
  const removed = await fetch(`http://localhost:${webPort}/api/v1/discover`);
  if (removed.status !== 404) throw new Error("Web still handles API paths");
  const startEmail = await fetch(`http://localhost:${webPort}/forms/email-start`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: `http://localhost:${webPort}` },
    body: new URLSearchParams({ email: "local-ports@example.com", returnTo: "/settings" }),
  });
  const destination = new URL(
    startEmail.headers.get("location") ?? "",
    `http://localhost:${webPort}`,
  );
  if (
    startEmail.status !== 303 ||
    destination.origin !== `http://localhost:${webPort}` ||
    destination.pathname !== "/sign-in/continue"
  )
    throw new Error("Native email start did not redirect on the allocated web origin");
  const cookies = new Map<string, string>();
  const adoptCookies = (response: Response) => {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";")[0];
      cookies.set(pair.split("=")[0], pair);
    }
  };
  adoptCookies(startEmail);
  const sendCode = await fetch(`http://localhost:${webPort}/forms/code-send`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: `http://localhost:${webPort}`, Cookie: [...cookies.values()].join("; ") },
    body: new URLSearchParams({ email: "local-ports@example.com", returnTo: "/settings" }),
  });
  const codeDestination = new URL(
    sendCode.headers.get("location") ?? "",
    `http://localhost:${webPort}`,
  );
  if (
    sendCode.status !== 303 ||
    codeDestination.origin !== `http://localhost:${webPort}` ||
    codeDestination.pathname !== "/sign-in/code" ||
    !["sent", "resent"].includes(codeDestination.searchParams.get("notice") ?? "")
  )
    throw new Error("Native sign-in did not issue a code through the configured API origin");
  adoptCookies(sendCode);
  const codePage = await fetch(codeDestination, {
    headers: { Cookie: [...cookies.values()].join("; ") },
  });
  if (!codePage.ok || !(await codePage.text()).includes('action="/forms/code-verify"'))
    throw new Error(
      "Native sign-in cookies or server-rendered code form did not survive the redirect",
    );

  await stop();
  for (const port of [apiPort, webPort]) {
    try {
      await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(500) });
      throw new Error(`Owned dev process still serves ${port}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Owned dev")) throw e;
    }
  }
  console.log(
    `Local ${builtWeb ? "production web" : "dev"} loop passed on ${webPort}/${apiPort}: API/worker/web scripts, ready URL, example links, native sign-in redirect, direct API, CORS, absent rewrite and shutdown.`,
  );
}, stop);
