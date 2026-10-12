import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve("apps/web/src");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(`${dir}/${entry.name}`)
      : /\.[tj]sx?$/.test(entry.name)
        ? [`${dir}/${entry.name}`]
        : [],
  );
}
const all = files(root);
const errors = new Set<string>();
const seen = new Set<string>();
function browserGraph(file: string) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  if (/server-only|node:|web-server|\b(?:process|Bun)\.env\b/.test(source))
    errors.add(`${file}: server code reachable from browser`);
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)/g)) {
    const spec = match[1];
    let target: string | undefined;
    if (spec.startsWith(".")) target = resolve(dirname(file), spec);
    if (spec === "@ntumie/config/web-browser") target = resolve("packages/config/src/web-browser");
    if (target) {
      const path = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find((p) =>
        existsSync(p),
      );
      if (path) browserGraph(path);
    }
  }
}
for (const file of all) {
  const source = readFileSync(file, "utf8");
  if (/\b(?:process|Bun)\.env\b/.test(source))
    errors.add(`${file}: runtime config must come from @ntumie/config`);
  if (/^["']use client["'];/m.test(source)) browserGraph(file);
  if (
    /import\s+["']server-only["']/.test(source) &&
    /from\s*["'][^"']*browser-api["']/.test(source)
  )
    errors.add(`${file}: server code must use the attributed server transport`);
  if (/localStorage|sessionStorage|dangerouslySetInnerHTML|["']use cache/.test(source))
    errors.add(`${file}: persistent browser data, raw HTML or caching needs a reviewed boundary`);
  if (
    /\bpostJson\b/.test(source) &&
    !["/lib/http.ts", "/lib/server-transport.ts"].some((suffix) => file.endsWith(suffix))
  )
    errors.add(`${file}: server writes must use the attributed server transport`);
  if (
    /\breadJson\b/.test(source) &&
    !["/lib/http.ts", "/lib/server-transport.ts", "/lib/browser-api.ts"].some((suffix) =>
      file.endsWith(suffix),
    )
  )
    errors.add(`${file}: reads must use the server or browser API boundary`);
  if (/\bfetch\(/.test(source) && !file.endsWith("/lib/http.ts"))
    errors.add(`${file}: use the shared HTTP adapter`);
}
if (errors.size) throw new Error([...errors].join("\n"));
console.log(
  `Web config/client boundary passes (${all.length} files, ${seen.size} browser modules).`,
);
