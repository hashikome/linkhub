import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const image = process.argv.slice(2).find((arg) => arg !== "--");
if (!image) throw new Error("Pass the locally built API image name");
const prefix = `release-check-${randomBytes(6).toString("hex")}`;
const secrets = await mkdtemp(join(tmpdir(), `${prefix}-`));
const containers: string[] = [];
let networkCreated = false;
let volumeCreated = false;
const network = `${prefix}-network`;
const volume = `${prefix}-database`;
const postgres = `${prefix}-postgres`;
const redis = `${prefix}-redis`;
const api = `${prefix}-api`;
const worker = `${prefix}-worker`;
let active: ReturnType<typeof Bun.spawn> | undefined;

async function docker(args: string[], input?: Uint8Array, allowFailure = false): Promise<string> {
  const child = Bun.spawn(["docker", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: input ? "pipe" : "ignore",
  });
  active = child;
  const timeout = setTimeout(() => child.kill(), 60000);
  if (input && child.stdin && typeof child.stdin !== "number") {
    child.stdin.write(input);
    child.stdin.end();
  }
  const [out, err, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  active = undefined;
  clearTimeout(timeout);
  if (status && !allowFailure) throw new Error(`Docker ${args[0]} failed: ${err}`);
  return args[0] === "logs" ? out + err : out;
}
async function start(name: string, args: string[]) {
  await docker(["run", "-d", "--name", name, "--network", network, ...args]);
  containers.push(name);
}
async function probe(path: string, status: number, expected: string) {
  const script = `const r=await fetch(${JSON.stringify(`http://api:4000${path}`)},{signal:AbortSignal.timeout(5000)});const b=await r.text();if(r.status!==${status}||!b.includes(${JSON.stringify(expected)}))process.exit(1);`;
  await docker(["run", "--rm", "--network", network, "--entrypoint", "bun", image, "-e", script]);
}
let cleanupPromise: Promise<void> | undefined;
function cleanup(): Promise<void> {
  cleanupPromise ??= (async () => {
    active?.kill();
    for (const name of containers.reverse())
      await docker(["rm", "-f", "-v", name], undefined, true);
    if (volumeCreated) await docker(["volume", "rm", volume], undefined, true);
    if (networkCreated) await docker(["network", "rm", network], undefined, true);
    await rm(secrets, { recursive: true, force: true });
  })();
  return cleanupPromise;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(1));
  });

try {
  const password = randomBytes(24).toString("hex");
  await writeFile(join(secrets, "postgres_password"), password, { mode: 0o644 });
  await writeFile(
    join(secrets, "database_url"),
    `postgresql://postgres:${password}@postgres:5432/rehearsal`,
    { mode: 0o644 },
  );
  await writeFile(join(secrets, "auth_secret"), randomBytes(32).toString("hex"), { mode: 0o644 });
  await docker(["network", "create", network]);
  networkCreated = true;
  await docker(["volume", "create", volume]);
  volumeCreated = true;
  // Keep the host directory private (mkdtemp's 0700), but mount individual
  // synthetic files. Container UID 1000 must not need to traverse the host
  // runner's directory: GitHub's runner UID differs from the local user's.
  await writeFile(join(secrets, "email_suppression"), randomBytes(32).toString("hex"), {
    mode: 0o644,
  });
  const secretMount = [
    "postgres_password",
    "database_url",
    "auth_secret",
    "email_suppression",
  ].flatMap((name) => [
    "--mount",
    `type=bind,source=${join(secrets, name)},target=/run/secrets/${name},readonly`,
  ]);
  await docker([
    "run",
    "--rm",
    "--user",
    "65534:65534",
    ...secretMount,
    "--entrypoint",
    "bun",
    image,
    "-e",
    "if((await Bun.file('/run/secrets/auth_secret').text()).length!==64)process.exit(1)",
  ]);
  await start(postgres, [
    "--network-alias",
    "postgres",
    ...secretMount,
    "-e",
    "POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password",
    "-e",
    "POSTGRES_DB=rehearsal",
    "--mount",
    `type=volume,source=${volume},target=/var/lib/postgresql`,
    "postgres:18",
  ]);
  await start(redis, [
    "--network-alias",
    "redis",
    "redis:7",
    "redis-server",
    "--appendonly",
    "yes",
    "--maxmemory-policy",
    "noeviction",
  ]);
  let databaseReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      await docker(["exec", postgres, "pg_isready", "-U", "postgres", "-d", "rehearsal"]);
      databaseReady = true;
      break;
    } catch {
      await Bun.sleep(500);
    }
  }
  if (!databaseReady) throw new Error("Disposable PostgreSQL did not become ready");
  await docker([
    "run",
    "--rm",
    "--network",
    network,
    ...secretMount,
    "-e",
    "DATABASE_URL_FILE=/run/secrets/database_url",
    "--entrypoint",
    "bun",
    image,
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
  ]);
  await start(api, [
    "--network-alias",
    "api",
    "--read-only",
    "--tmpfs",
    "/tmp",
    ...secretMount,
    "-e",
    "DATABASE_URL_FILE=/run/secrets/database_url",
    "-e",
    "BETTER_AUTH_SECRET_FILE=/run/secrets/auth_secret",
    "-e",
    "EMAIL_SUPPRESSION_SECRET_FILE=/run/secrets/email_suppression",
    "-e",
    "REDIS_URL=redis://redis:6379",
    "-e",
    "BETTER_AUTH_URL=http://api:4000",
    "-e",
    "EMAIL_PROVIDER=capture",
    "-e",
    "EMAIL_SUPPORT_URL=https://example.com/support",
    "-e",
    "QUEUE_NAMESPACE=release-rehearsal",
    image,
  ]);
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      await probe("/api/v1/status", 200, '"status":"ready"');
      ready = true;
      break;
    } catch {
      await Bun.sleep(500);
    }
  }
  if (!ready) {
    const logs = await docker(["logs", api]);
    throw new Error(`API image did not become ready: ${logs}`);
  }
  await probe("/api/v1/health", 200, '"status":"ok"');
  console.log("Image boot, compiled imports, secret files and readiness passed.");

  // Exercise real issuance/consumption before starting capture delivery. Read
  // only this synthetic fixture's encrypted intent inside the disposable API
  // container; never replace a library challenge or print its secret/code.
  const fixture = `
    const {PrismaClient}=await import('./dist/src/generated/prisma/client.js');
    const {PrismaPg}=await import('@prisma/adapter-pg');
    const {readSecret}=await import('./dist/src/config/secret.js');
    const {emailKey,unseal}=await import('./dist/src/email/outbox.js');
    const db=new PrismaClient({adapter:new PrismaPg({connectionString:readSecret('DATABASE_URL')})});
    const root='http://api:4000/api/v1';const email='restore@example.com';
    const sent=await fetch(root+'/auth/code/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});if(!sent.ok)process.exit(1);
    const secret=readSecret('BETTER_AUTH_SECRET');
    const intent=await db.emailOutbox.findFirstOrThrow({where:{recipientKey:emailKey(readSecret('EMAIL_SUPPRESSION_SECRET'),'recipient',email),state:'pending'}});
    const code=unseal(intent.payload,secret).text.match(/\\b\\d{8}\\b/)[0];
    const r=await fetch(root+'/auth/code/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,code,name:'Restore'})});if(!r.ok)process.exit(1);
    const t=r.headers.get('set-auth-token');
    const c=await fetch(root+'/collections',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify({title:'Restore check',published:true})});if(!c.ok)process.exit(1);
    await db.$disconnect();`;
  await docker(["exec", api, "bun", "-e", fixture]);
  await start(worker, [
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--no-healthcheck",
    ...secretMount,
    "-e",
    "DATABASE_URL_FILE=/run/secrets/database_url",
    "-e",
    "BETTER_AUTH_SECRET_FILE=/run/secrets/auth_secret",
    "-e",
    "EMAIL_SUPPRESSION_SECRET_FILE=/run/secrets/email_suppression",
    "-e",
    "REDIS_URL=redis://redis:6379",
    "-e",
    "EMAIL_PROVIDER=capture",
    "-e",
    "EMAIL_SUPPORT_URL=https://example.com/support",
    "-e",
    "QUEUE_NAMESPACE=release-rehearsal",
    image,
    "bun",
    "--tsconfig-override",
    "tsconfig.runtime.json",
    "dist/src/email/worker.js",
  ]);
  let delivered = false;
  for (let i = 0; i < 20; i++) {
    const count = await docker([
      "exec",
      postgres,
      "psql",
      "-U",
      "postgres",
      "-d",
      "rehearsal",
      "-Atc",
      "SELECT count(*) FROM email_outbox WHERE state='sent' AND payload IS NULL",
    ]);
    if (count.trim() === "1") {
      delivered = true;
      break;
    }
    await Bun.sleep(500);
  }
  if (!delivered) throw new Error("Compiled email worker did not capture delivery");
  console.log("Compiled code issuance, queued capture delivery and credential cleanup passed.");

  const dump = Bun.spawn(
    [
      "docker",
      "exec",
      postgres,
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "rehearsal",
      "-Fc",
      "--no-owner",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const backup = new Uint8Array(await new Response(dump.stdout).arrayBuffer());
  if (await dump.exited) throw new Error("Disposable backup failed");
  await docker(["exec", postgres, "createdb", "-U", "postgres", "restored"]);
  await docker(
    [
      "exec",
      "-i",
      postgres,
      "pg_restore",
      "--exit-on-error",
      "--no-owner",
      "-U",
      "postgres",
      "-d",
      "restored",
    ],
    backup,
  );
  const restored = await docker([
    "exec",
    postgres,
    "psql",
    "-U",
    "postgres",
    "-d",
    "restored",
    "-Atc",
    "SELECT count(*) FROM audit_logs WHERE action = 'collection.published'",
  ]);
  if (restored.trim() !== "1") throw new Error("Restored audit fixture missing");
  console.log("Disposable backup and restore preserved the publication audit.");

  await docker(["stop", redis]);
  await probe("/api/v1/status", 200, '"status":"degraded"');
  await probe("/api/v1/health", 200, '"status":"ok"');
  await docker(["stop", "--time", "12", worker]);
  if ((await docker(["inspect", "--format", "{{.State.ExitCode}}", worker])).trim() !== "0")
    throw new Error("Worker did not shut down gracefully during Redis outage");
  await docker(["stop", postgres]);
  await probe("/api/v1/status", 503, "dependencies_unavailable");
  await probe("/api/v1/health", 200, '"status":"ok"');
  await docker(["stop", "--time", "8", api]);
  const exit = await docker(["inspect", "--format", "{{.State.ExitCode}}", api]);
  if (exit.trim() !== "0") throw new Error("API did not shut down gracefully");
  console.log("Dependency outage behavior and bounded SIGTERM shutdown passed.");

  const invalid = `${prefix}-invalid`;
  await start(invalid, [image]);
  const invalidExit = await docker(["wait", invalid]);
  if (invalidExit.trim() !== "1")
    throw new Error("Production startup did not reject missing secrets");
  const invalidTelemetry = `${prefix}-invalid-telemetry`;
  await start(invalidTelemetry, ["-e", "SENTRY_DSN_FILE=/never-export-secret-path", image]);
  if ((await docker(["wait", invalidTelemetry])).trim() !== "1")
    throw new Error("Startup did not reject unreadable telemetry configuration");
  if ((await docker(["logs", invalidTelemetry])).includes("never-export"))
    throw new Error("Startup leaked the secret file path");
  console.log("Production configuration refusal passed. No live service was contacted.");
} finally {
  await cleanup();
}
