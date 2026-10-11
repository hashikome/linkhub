import { onTestFinished } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { diagnoseContext } from "./browser-diagnostics";

type Scope = {
  temporary: Promise<string>;
  contexts: Promise<() => Promise<void>>[];
  finished: boolean;
};
const scopes = new AsyncLocalStorage<Scope>();

export async function diagnosticContext(context: BrowserContext) {
  const scope = scopes.getStore();
  if (!scope || scope.finished) {
    await context.close();
    throw new Error("Browser context created outside an active diagnostic test");
  }
  const index = scope.contexts.length;
  const closing = scope.temporary.then(async (temporary) => {
    const close = await diagnoseContext(context, temporary, index);
    let result: Promise<void> | undefined;
    return () => (result ??= close());
  });
  scope.contexts.push(closing);
  return closing;
}

export async function withBrowserDiagnostics({
  name,
  output,
  metadata,
  run,
}: {
  name: string;
  output: string;
  metadata: () => Record<string, unknown>;
  run: () => Promise<void>;
}) {
  const scope: Scope = {
    temporary: mkdtemp(join(tmpdir(), "browser-diagnostics-")),
    contexts: [],
    finished: false,
  };
  let succeeded = false;
  // Bun timeouts do not reject the body promise. Snapshot completion when the
  // runner finishes the test, before any late body can report success.
  onTestFinished(async () => {
    scope.finished = true;
    const retain = !succeeded;
    const temporary = await scope.temporary;
    try {
      const results = await Promise.allSettled(
        scope.contexts.map(async (close) => (await close)()),
      );
      if (retain || results.some((result) => result.status === "rejected")) {
        const destination = join(output, name.replace(/[^a-z0-9]+/gi, "-").slice(0, 120));
        await mkdir(destination, { recursive: true });
        await cp(temporary, destination, { recursive: true });
        await Bun.write(join(destination, "fixture.json"), JSON.stringify(metadata(), null, 2));
        console.error(`Sanitized browser diagnostics: ${destination}`);
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }, 15000);
  await scopes.run(scope, async () => {
    await run();
    succeeded = true;
  });
}
