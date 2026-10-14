import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const image = process.argv.slice(2).find((arg) => arg !== "--");
if (!image) throw new Error("Pass the locally built API image name");
const webImage = process.argv.slice(2).filter((arg) => arg !== "--")[1];
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
const web = `${prefix}-web`;
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
  const runtimePassword = randomBytes(24).toString("hex");
  const migrationPassword = randomBytes(24).toString("hex");
  const queuePassword = randomBytes(24).toString("hex");
  const otherQueuePassword = randomBytes(24).toString("hex");
  await writeFile(join(secrets, "postgres_password"), password, { mode: 0o644 });
  await writeFile(
    join(secrets, "database_url"),
    `postgresql://ntumie_runtime:${runtimePassword}@postgres:5432/rehearsal`,
    { mode: 0o644 },
  );
  await writeFile(
    join(secrets, "migration_database_url"),
    `postgresql://ntumie_migrator:${migrationPassword}@postgres:5432/rehearsal`,
    { mode: 0o644 },
  );
  await writeFile(join(secrets, "redis_url"), `redis://ntumie:${queuePassword}@redis:6379/0`, {
    mode: 0o644,
  });
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
  await writeFile(join(secrets, "web_source"), randomBytes(32).toString("hex"), { mode: 0o644 });
  const secretMount = [
    "database_url",
    "redis_url",
    "auth_secret",
    "email_suppression",
    "web_source",
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
    "--mount",
    `type=bind,source=${join(secrets, "postgres_password")},target=/run/secrets/postgres_password,readonly`,
    "-e",
    "POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password",
    "-e",
    "POSTGRES_DB=postgres",
    "--mount",
    `type=volume,source=${volume},target=/var/lib/postgresql`,
    "postgres:18",
  ]);
  // BullMQ needs scripts, transactions, streams and blocking list commands, but
  // has no authority to administer Redis or access another product's keys/channels.
  await writeFile(
    join(secrets, "redis_acl"),
    [
      "user default off",
      "user health on nopass -@all +ping",
      `user ntumie on >${queuePassword} ~release-rehearsal:* &release-rehearsal:* -@all +@read +@write +@connection +@transaction +@scripting +@pubsub -@dangerous +info +client|setname +client|setinfo +client|id +client|unblock`,
      `user other on >${otherQueuePassword} ~other:* &other:* -@all +get +set +publish +ping`,
      "",
    ].join("\n"),
    { mode: 0o644 },
  );
  await start(redis, [
    "--mount",
    `type=bind,source=${join(secrets, "redis_acl")},target=/run/secrets/redis_acl,readonly`,
    "--network-alias",
    "redis",
    "redis:7",
    "redis-server",
    "--aclfile",
    "/run/secrets/redis_acl",
    "--appendonly",
    "yes",
    "--maxmemory-policy",
    "noeviction",
  ]);
  let databaseReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      // The image's temporary initialization server accepts Unix sockets before
      // restarting. TCP readiness identifies the final server used by the app.
      await docker([
        "exec",
        postgres,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "-d",
        "postgres",
      ]);
      databaseReady = true;
      break;
    } catch {
      await Bun.sleep(500);
    }
  }
  if (!databaseReady) throw new Error("Disposable PostgreSQL did not become ready");
  await docker(
    ["exec", "-i", postgres, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres"],
    new TextEncoder().encode(`
    CREATE ROLE ntumie_migrator LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 2;
    CREATE ROLE ntumie_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 40;
    CREATE ROLE other_owner NOLOGIN;
    CREATE DATABASE rehearsal OWNER ntumie_migrator;
    CREATE DATABASE other_product OWNER other_owner;
    REVOKE ALL ON DATABASE rehearsal, other_product FROM PUBLIC;
    GRANT CONNECT ON DATABASE rehearsal TO ntumie_runtime;
    \\connect rehearsal
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO ntumie_runtime;
    ALTER DEFAULT PRIVILEGES FOR ROLE ntumie_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ntumie_runtime;
    ALTER DEFAULT PRIVILEGES FOR ROLE ntumie_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ntumie_runtime;
  `),
  );

  const migrationArgs = [
    "run",
    "--rm",
    "--network",
    network,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--mount",
    `type=bind,source=${join(secrets, "migration_database_url")},target=/run/secrets/database_url,readonly`,
    "-e",
    "DATABASE_URL_FILE=/run/secrets/database_url",
    "--entrypoint",
    "bun",
    image,
    "--tsconfig-override",
    "tsconfig.runtime.json",
    "dist/src/operations/migrate-release.js",
  ];
  // Apply and retry through the exact production job, not an administrator fixup.
  await docker(migrationArgs);
  await docker(migrationArgs);
  const wrongRole = migrationArgs.map((value) =>
    value.replace(
      `source=${join(secrets, "migration_database_url")}`,
      `source=${join(secrets, "database_url")}`,
    ),
  );
  let wrongRoleRefused = false;
  try {
    await docker(wrongRole);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("allocation identity")) throw error;
    wrongRoleRefused = true;
  }
  if (!wrongRoleRefused) throw new Error("Runtime credential was accepted as migration owner");
  console.log("Compiled migration, idempotent grant verification and wrong-role refusal passed.");
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
    "REDIS_URL_FILE=/run/secrets/redis_url",
    "-e",
    "BETTER_AUTH_URL=https://ntumie.link",
    "-e",
    "WEB_SOURCE_SECRET_FILE=/run/secrets/web_source",
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
  await docker([
    "exec",
    api,
    "bun",
    "-e",
    `
    const {Client}=await import('pg');
    const url=(await Bun.file('/run/secrets/database_url').text()).trim();
    const db=new Client({connectionString:url});await db.connect();
    try {await db.query('CREATE TABLE forbidden_ddl (id int)');process.exit(1)} catch(e) {if(e.code!=='42501')throw e}
    try {await db.query('DELETE FROM _prisma_migrations');process.exit(1)} catch(e) {if(e.code!=='42501')throw e}
    await db.end();
    const other=new Client({connectionString:url.replace('/rehearsal','/other_product')});
    try {await other.connect();process.exit(1)} catch(e) {if(e.code!=='42501')throw e}
    await other.end();
    const {default:Redis}=await import('ioredis');
    const redis=new Redis((await Bun.file('/run/secrets/redis_url').text()).trim(),{maxRetriesPerRequest:1});
    await redis.set('release-rehearsal:fixture','ok');
    for(const action of [()=>redis.get('other:fixture'),()=>redis.eval("return redis.call('GET',KEYS[1])",1,'other:fixture'),()=>redis.set('other:fixture','bad'),()=>redis.publish('other:events','bad'),()=>redis.flushall(),()=>redis.config('GET','*')]) {
      try {await action();process.exit(1)} catch(e) {if(!String(e).includes('NOPERM'))throw e}
    }
    await redis.quit();
  `,
  ]);
  console.log(
    "Shared PostgreSQL runtime/DDL/database isolation and queue key/channel/admin ACL refusal passed.",
  );

  if (webImage) {
    await start(web, [
      "--network-alias",
      "web",
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--mount",
      `type=bind,source=${join(secrets, "web_source")},target=/run/secrets/web_source,readonly`,
      "-e",
      "WEB_SOURCE_SECRET_FILE=/run/secrets/web_source",
      "-e",
      "API_INTERNAL_ORIGIN=http://api:4000",
      "-e",
      "BETTER_AUTH_URL=https://ntumie.link",
      "-e",
      "WEB_ORIGIN=https://ntumie.link",
      webImage,
    ]);
    let webReady = false;
    for (let i = 0; i < 60; i++) {
      try {
        await docker([
          "exec",
          web,
          "bun",
          "-e",
          "const r=await fetch('http://127.0.0.1:3000/healthz');if(r.status!==200||await r.text()!=='ok\\n')process.exit(1)",
        ]);
        webReady = true;
        break;
      } catch {
        await Bun.sleep(500);
      }
    }
    if (!webReady)
      throw new Error(`Web image failed to become ready: ${await docker(["logs", web])}`);
    await docker([
      "exec",
      web,
      "bun",
      "-e",
      `
      // Signed-out public pages carry the edge policy (ADR-0066); others stay private.
      for(const [path,cookie,policy] of [['/sign-in','','no-store'],['/about','','s-maxage=60'],['/about','better-auth.session_token=x','no-store']]) {
        const r=await fetch('http://127.0.0.1:3000'+path,{headers:cookie?{cookie}:{}});
        const body=await r.text();
        if(r.status!==200||!body.includes('ntumie')||!r.headers.get('cache-control')?.includes(policy))process.exit(1);
        if(body.includes('http://api:4000'))process.exit(1);
      }
    `,
    ]);
    console.log(
      "Web image custom server, secret-file startup, runtime origin, private and edge-cacheable pages passed.",
    );
  }

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
    const sent=await fetch(root+'/auth/code/send',{method:'POST',headers:{'content-type':'application/json',origin:'https://ntumie.link'},body:JSON.stringify({email})});if(!sent.ok)throw new Error('Synthetic code send: HTTP '+sent.status);
    const secret=readSecret('BETTER_AUTH_SECRET');
    const intent=await db.emailOutbox.findFirstOrThrow({where:{recipientKey:emailKey(readSecret('EMAIL_SUPPRESSION_SECRET'),'recipient',email),state:'pending'}});
    const code=unseal(intent.payload,secret).text.match(/^\\d{6}$/m)[0];
    const r=await fetch(root+'/auth/code/verify',{method:'POST',headers:{'content-type':'application/json',origin:'https://ntumie.link'},body:JSON.stringify({email,code,name:'Restore',createAccount:true})});if(!r.ok)throw new Error('Synthetic code verify: HTTP '+r.status);
    const t=r.headers.get('set-auth-token');if(!t)throw new Error('Synthetic session missing');
    const hub=await fetch(root+'/hubs',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:'{}'});if(!hub.ok)throw new Error('Synthetic hub: HTTP '+hub.status);
    const c=await fetch(root+'/collections',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+t},body:JSON.stringify({title:'Restore check',published:true})});if(!c.ok)throw new Error('Synthetic collection: HTTP '+c.status);
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
    "REDIS_URL_FILE=/run/secrets/redis_url",
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

  console.log(
    "Worker before Redis outage: " +
      (await docker(["inspect", "--format", "{{.State.Status}}", worker])).trim(),
  );
  await docker(["stop", redis]);
  await probe("/api/v1/status", 200, '"status":"degraded"');
  await probe("/api/v1/health", 200, '"status":"ok"');
  await docker(["stop", "--time", "12", worker]);
  const workerExit = (await docker(["inspect", "--format", "{{.State.ExitCode}}", worker])).trim();
  if (workerExit !== "0") {
    const events =
      (await docker(["logs", worker])).match(/(?:email|link_metadata|imports)\.[a-z_]+/g) ?? [];
    throw new Error(
      `Worker Redis-outage shutdown exit ${workerExit}; events: ${events.join(", ")}`,
    );
  }
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
  if (webImage) {
    const invalidWeb = `${prefix}-invalid-web`;
    await start(invalidWeb, [webImage]);
    if ((await docker(["wait", invalidWeb])).trim() !== "1")
      throw new Error("Web startup did not reject missing production configuration");
  }
  console.log("Production configuration refusal passed. No live service was contacted.");
} finally {
  await cleanup();
}
