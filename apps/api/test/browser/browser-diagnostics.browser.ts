import { expect, it } from "bun:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { sanitizeTrace } from "./browser-diagnostics";

it("retains diagnostics after a runner timeout even when the body later succeeds", async () => {
  const { mkdtemp, readdir, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "diagnostics-timeout-proof-"));
  const fixture = join(directory, "timeout.test.ts");
  const output = join(directory, "evidence");
  await Bun.write(
    fixture,
    `
    import { afterAll, beforeAll, test } from "bun:test";
    import { chromium } from ${JSON.stringify(require.resolve("@playwright/test"))};
    import { diagnosticContext, withBrowserDiagnostics } from ${JSON.stringify(join(__dirname, "browser-diagnostic-test.ts"))};
    let browser;
    beforeAll(async () => { browser = await chromium.launch({ channel: "chromium", executablePath: process.env.BROWSER_CHROME_PATH, args: ["--no-sandbox"] }); });
    afterAll(() => browser.close());
    for (const name of ["success", "throws", "timeout"]) {
      test(name, () => withBrowserDiagnostics({
        name, output: ${JSON.stringify(output)}, metadata: () => ({ synthetic: true }),
        run: async () => {
          const context = await browser.newContext();
          const close = await diagnosticContext(context);
          try {
            const page = await context.newPage();
            await page.setContent('<label>Code<input></label>');
            await page.getByLabel("Code").fill("TIMEOUT-SECRET-CANARY");
            if (name === "throws") throw new Error("Synthetic body failure");
            if (name === "timeout") await Bun.sleep(1400);
          } finally { await close(); }
          if (name === "timeout") console.log("timed-out body completed successfully");
        },
      }), name === "timeout" ? 1000 : 5000);
    }
    test("allows late completion", async () => { await Bun.sleep(1000); });
  `,
  );
  try {
    const child = Bun.spawn([process.execPath, "test", fixture], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("timed out");
    expect(stdout + stderr).toContain("timed-out body completed successfully");
    expect((await readdir(output)).sort()).toEqual(["throws", "timeout"]);
    for (const name of ["throws", "timeout"]) {
      const files = unzipSync(await readFile(join(output, name, "context-0/trace.zip")));
      const trace = Object.values(files)
        .map((bytes) => strFromU8(bytes))
        .join("\n");
      expect(trace).toContain('"method":"fill"');
      expect(trace).not.toContain("TIMEOUT-SECRET-CANARY");
      expect(await readdir(join(output, name, "context-0"))).not.toContain("raw.zip");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 15000);

it("keeps trace timing while excluding credentials, codes, snapshots and response bodies", () => {
  const secret = "SENSITIVE-CANARY-12345678";
  const source = zipSync({
    "trace.trace": strToU8(
      [
        {
          type: "context-options",
          version: 8,
          options: { storageState: secret },
          browserName: "chromium",
        },
        {
          type: "before",
          callId: "call@1",
          startTime: 20,
          apiName: "locator.fill",
          method: "fill",
          params: { value: secret },
          stack: secret,
        },
        {
          type: "after",
          callId: "call@1",
          endTime: 25,
          result: secret,
          error: { message: secret },
        },
        { type: "log", message: secret },
        { type: "frame-snapshot", snapshot: secret },
      ]
        .map((event) => JSON.stringify(event))
        .join("\n"),
    ),
    "trace.network": strToU8(secret),
    "resources/body": strToU8(secret),
  });
  const files = unzipSync(sanitizeTrace(source));
  expect(Object.keys(files)).toEqual(["trace.trace"]);
  const clean = strFromU8(files["trace.trace"]);
  expect(clean).not.toContain(secret);
  expect(clean).toContain('"startTime":20');
  expect(clean).toContain('"endTime":25');
  expect(clean).toContain("locator.fill");
});

it("writes usable sanitized diagnostics from a real browser context", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { chromium } = await import("@playwright/test");
  const { diagnoseContext } = await import("./browser-diagnostics.js");
  const directory = await mkdtemp(join(tmpdir(), "diagnostics-proof-"));
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_CHROME_PATH,
    channel: "chromium",
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext();
    const close = await diagnoseContext(context, directory, 0);
    const page = await context.newPage();
    const secret = "ACTUAL-TYPED-CODE-87654321";
    await page.setContent("<label>Code<input></label>");
    await page.getByLabel("Code").fill(secret);
    await context.route("http://diagnostics.test/**", (route) => route.abort("connectionfailed"));
    await page.goto(`http://diagnostics.test/probe?code=${secret}`).catch(() => undefined);
    await close();
    const files = unzipSync(await readFile(join(directory, "context-0/trace.zip")));
    const trace = Object.values(files)
      .map((bytes) => strFromU8(bytes))
      .join("\n");
    expect(trace).not.toContain(secret);
    expect(trace).toContain('"method":"fill"');
    expect(trace).toContain('"type":"context-options"');
    const waterfall = await readFile(join(directory, "context-0/waterfall.json"), "utf8");
    expect(waterfall).not.toContain(secret);
    expect(JSON.parse(waterfall)).toContainEqual(
      expect.objectContaining({ path: "/probe", failure: "net::ERR_CONNECTION_FAILED" }),
    );
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
