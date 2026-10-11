import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { routeShape } from "./production-performance";

// Trace action arguments/errors can contain typed codes, cookies and passwords.
// Keep only timing/identity metadata. Never retain snapshots or network bodies.
export function sanitizeTrace(input: Uint8Array) {
  const output: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(unzipSync(input))) {
    if (!name.endsWith(".trace")) continue;
    const events = strFromU8(bytes)
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        const event = JSON.parse(line);
        const allowed =
          event.type === "context-options"
            ? [
                "type",
                "version",
                "browserName",
                "platform",
                "wallTime",
                "monotonicTime",
                "sdkLanguage",
                "contextId",
              ]
            : event.type === "before"
              ? ["type", "callId", "startTime", "apiName", "class", "method", "pageId", "stepId"]
              : event.type === "after"
                ? ["type", "callId", "endTime"]
                : [];
        if (!allowed.length) return [];
        const clean = Object.fromEntries(
          allowed.filter((key) => key in event).map((key) => [key, event[key]]),
        );
        if (event.type === "before") clean.params = {};
        if (event.type === "context-options") clean.options = {};
        if (event.error)
          clean.error = {
            name: "Error",
            message: "Action failed; inspect the sanitized waterfall and screenshot.",
          };
        return [JSON.stringify(clean)];
      });
    output[name] = strToU8(`${events.join("\n")}\n`);
  }
  return zipSync(output);
}

export async function diagnoseContext(context: BrowserContext, temporary: string, index: number) {
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  const waterfall: unknown[] = [];
  const pending: Promise<void>[] = [];
  context.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "Request failed";
    waterfall.push({
      path: routeShape(request.url()),
      method: request.method(),
      resource: request.resourceType(),
      timing: request.timing(),
      failure: /^net::[A-Z0-9_]+$/.test(failure) ? failure : "Request failed",
    });
  });
  context.on("response", (response) => {
    const request = response.request();
    const start = performance.now();
    pending.push(
      response
        .finished()
        .catch(() => null)
        .then(() => {
          waterfall.push({
            path: routeShape(response.url()),
            method: request.method(),
            status: response.status(),
            resource: request.resourceType(),
            timing: request.timing(),
            observedMs: performance.now() - start,
          });
        }),
    );
  });
  return async () => {
    const destination = join(temporary, `context-${index}`);
    await mkdir(destination, { recursive: true });
    const raw = join(destination, "raw.zip");
    try {
      let pageIndex = 0;
      for (const page of context.pages()) {
        if (page.isClosed() || !page.url().startsWith("http")) continue;
        // Authentication/account screens can display recovery material as text.
        if (
          /sign-|verify|auth|account|security|recover|invitation/.test(new URL(page.url()).pathname)
        )
          continue;
        await page
          .screenshot({
            path: join(destination, `page-${pageIndex++}.png`),
            timeout: 3000,
            mask: [page.locator("input, textarea, code, .account-menu-identity")],
          })
          .catch(() => undefined);
      }
      await context.tracing.stop({ path: raw });
      await writeFile(join(destination, "trace.zip"), sanitizeTrace(await readFile(raw)));
      // Bun may kill the browser when it enforces a test timeout. Closing an
      // already-lost context must not discard the trace or waterfall.
      await context.close().catch(() => undefined);
      await Promise.all(pending);
      await writeFile(join(destination, "waterfall.json"), JSON.stringify(waterfall, null, 2));
    } finally {
      await rm(raw, { force: true });
      // Bun may kill the browser when it enforces a test timeout. Closing an
      // already-lost context must not discard the trace or waterfall.
      await context.close().catch(() => undefined);
    }
  };
}
