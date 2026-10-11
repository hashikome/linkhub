// Fails if a client app imports backend internals or Prisma. Clients consume
// the API over HTTP and the `@linkhub/types` contract only — never
// `apps/api` source or the persistence layer (ARCHITECTURE dependency rules).
// Also scan browser-reachable shared contracts/configuration.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const CLIENT_DIRS = ["apps/web", "apps/extension", "packages/config/src", "packages/types/src"];
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".turbo"]);

const FORBIDDEN: Array<{ pattern: RegExp; why: string }> = [
  {
    pattern: /^@linkhub\/(?!types(?:$|\/)|config(?:$|\/))/,
    why: "backend-owned workspace package",
  },
  {
    pattern: /^(?:(?:pg|postgres|ioredis|bullmq|drizzle-orm)(?:$|\/)|@nestjs\/)/,
    why: "database or backend framework",
  },
  { pattern: /(^|[^\w])@prisma\//, why: "Prisma client (@prisma/*)" },
  { pattern: /(^|\/)apps\/api(\/|$)/, why: "apps/api backend internals" },
  { pattern: /generated\/prisma/, why: "generated Prisma client" },
  { pattern: /prisma\.(service|module)/, why: "PrismaService / PrismaModule" },
];

const IMPORT_RE =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (CODE_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function specifiers(source: string): string[] {
  const specs: string[] = [];
  IMPORT_RE.lastIndex = 0;
  let match = IMPORT_RE.exec(source);
  while (match !== null) {
    const spec = match[1] ?? match[2];
    if (spec) specs.push(spec);
    match = IMPORT_RE.exec(source);
  }
  return specs;
}

const violations: Array<{ file: string; spec: string; why: string }> = [];
let scanned = 0;

for (const clientDir of CLIENT_DIRS) {
  const base = existsSync(clientDir) ? clientDir : null;
  if (!base) continue;
  for (const file of walk(base)) {
    scanned += 1;
    const source = readFileSync(file, "utf8");
    for (const spec of specifiers(source)) {
      if (
        spec.startsWith(".") &&
        ["apps/api", "packages/email", "packages/domain"].some((base) =>
          resolve(dirname(file), spec).startsWith(`${resolve(base)}/`),
        )
      ) {
        violations.push({ file, spec, why: "relative backend import" });
      }
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(spec)) {
          violations.push({ file, spec, why: rule.why });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Client boundary check FAILED:\n");
  for (const v of violations) {
    console.error(`  ${v.file}\n    imports "${v.spec}" -> ${v.why}`);
  }
  console.error("\nClients must consume the API over HTTP and @linkhub/types only.");
  process.exit(1);
}

console.log(`Client boundary check passed (${scanned} client file(s) scanned).`);
