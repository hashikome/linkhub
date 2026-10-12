import { Client } from "pg";
import { readSecret } from "../config/secret";

// The release job has only the scoped migration credential. Never print Prisma
// output or database errors here: either can contain connection details.
async function main() {
  let stage = "configuration";
  let database: Client | undefined;
  try {
    if (!process.env.DATABASE_URL_FILE) throw new Error();
    const connectionString = readSecret("DATABASE_URL");
    if (!connectionString) throw new Error();
    const options = {
      connectionString,
      connectionTimeoutMillis: 10000,
      statement_timeout: 30000,
    };
    database = new Client(options);
    stage = "allocation identity";
    await database.connect();
    const identity = await database.query(`
      SELECT current_database() AS name, current_user = 'ntumie_migrator'
        AND d.datdba = m.oid
        AND NOT (m.rolsuper OR m.rolcreatedb OR m.rolcreaterole OR m.rolreplication OR m.rolbypassrls)
        AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
        AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member IN (r.oid, m.oid))
        AND NOT has_schema_privilege(r.oid, 'public', 'CREATE') AS accepted
      FROM pg_database d, pg_roles m, pg_roles r
      WHERE d.datname = current_database()
        AND m.rolname = 'ntumie_migrator' AND r.rolname = 'ntumie_runtime'
    `);
    if (identity.rows[0]?.accepted !== true) throw new Error();
    const databaseName = identity.rows[0].name as string;
    // Leave the migration role's two-connection budget entirely to Prisma.
    await database.end();
    database = undefined;

    stage = "schema migration";
    const migration = Bun.spawn(
      [process.execPath, "node_modules/prisma/build/index.js", "migrate", "deploy"],
      { stdout: "ignore", stderr: "ignore", stdin: "ignore" },
    );
    const timeout = setTimeout(() => migration.kill("SIGKILL"), 300000);
    let exit: number;
    try {
      exit = await migration.exited;
    } finally {
      clearTimeout(timeout);
    }
    if (exit !== 0) throw new Error();

    stage = "runtime grants";
    database = new Client(options);
    await database.connect();
    await database.query("BEGIN");
    await database.query(`
      GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ntumie_runtime;
      GRANT USAGE ON SCHEMA public TO ntumie_runtime;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ntumie_runtime;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ntumie_runtime;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ntumie_runtime;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO ntumie_runtime;
      REVOKE ALL ON TABLE public._prisma_migrations FROM ntumie_runtime;
    `);
    const grants = await database.query(`
      SELECT NOT has_schema_privilege('ntumie_runtime', 'public', 'CREATE')
        AND NOT has_table_privilege('ntumie_runtime', 'public._prisma_migrations',
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            AND c.relname <> '_prisma_migrations'
            AND (NOT has_table_privilege('ntumie_runtime', c.oid, 'SELECT')
              OR NOT has_table_privilege('ntumie_runtime', c.oid, 'INSERT')
              OR NOT has_table_privilege('ntumie_runtime', c.oid, 'UPDATE')
              OR NOT has_table_privilege('ntumie_runtime', c.oid, 'DELETE'))
        ) AS accepted
    `);
    if (grants.rows[0]?.accepted !== true) throw new Error();
    await database.query("COMMIT");
    process.stdout.write("Migration and runtime privilege verification completed.\n");
  } catch {
    process.stderr.write(`Release migration failed at ${stage}; application promotion refused.\n`);
    process.exitCode = 1;
  } finally {
    await database?.end().catch(() => {});
  }
}

function escapeIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

void main();
