import { cpus, platform, release } from "node:os";
import { join } from "node:path";
import { type Browser, expect, type Page } from "@playwright/test";

export type ApiTiming = { path: string; method: string; ms: number; status: number };

// Only route shapes enter reports; never query strings, cookies or content.
export function routeShape(url: string) {
  return new URL(url, "http://fixture.invalid").pathname.replace(
    /[0-9a-f]{8}-[0-9a-f-]{27,}/gi,
    ":id",
  );
}

export async function measureProduction({
  browser,
  origin,
  cookie,
  hubId,
  sourceId,
  apiTimings,
  output,
  fixture,
  resetBudget,
}: {
  browser: Browser;
  origin: string;
  cookie: string;
  hubId: string;
  sourceId: string;
  apiTimings: ApiTiming[];
  output: string;
  fixture: { collections: number; resources: number };
  resetBudget: () => Promise<unknown>;
}) {
  const samples: unknown[] = [];
  const persist = async () => {
    await Bun.write(
      join(output, "production-performance.json"),
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          browser: browser.version(),
          browserMode: process.env.BROWSER_CHROME_PATH
            ? "explicit executable override"
            : "chromium channel, headless",
          bun: Bun.version,
          machine: {
            platform: platform(),
            release: release(),
            cpu: cpus()[0]?.model,
            logicalCpus: cpus().length,
          },
          conditions: {
            slow: {
              latencyMs: 150,
              downloadBytesPerSecond: 200000,
              uploadBytesPerSecond: 93750,
              cpuRate: 4,
            },
            repeats: 3,
            transport: "loopback HTTP, fixture ingress requests identity encoding",
            fixture: { ...fixture, synthetic: true, externalMetadataWorker: false },
          },
          samples,
        },
        null,
        2,
      ),
    );
  };
  for (const slow of [false, true]) {
    for (let repeat = 0; repeat < 3; repeat++) {
      const context = await browser.newContext();
      await context.addCookies([
        {
          name: "better-auth.session_token",
          value: cookie.split("=").slice(1).join("="),
          url: origin,
        },
      ]);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(60000);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      if (slow) {
        await cdp.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: 200000,
          uploadThroughput: 93750,
        });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      }
      const headers: { path: string; cacheControl: string }[] = [];
      page.on("response", (response) => {
        if (/\.(js|css)(\?|$)/.test(response.url()))
          headers.push({
            path: routeShape(response.url()),
            cacheControl: response.headers()["cache-control"] ?? "",
          });
      });
      const measure = async (
        journey: string,
        cache: string,
        action: (page: Page) => Promise<unknown>,
      ) => {
        // Each sample is a journey, not a load test. Reset this disposable
        // fixture's budget so faster runs do not measure rate-limit error pages.
        await resetBudget();
        apiTimings.length = 0;
        headers.length = 0;
        await action(page);
        await page.waitForFunction(
          () => performance.getEntriesByName("app:document-ready").length > 0,
        );
        await page.evaluate(() => document.fonts.ready);
        const timing = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          const resources = (
            performance.getEntriesByType("resource") as PerformanceResourceTiming[]
          ).map((r) => ({
            path: new URL(r.name).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id"),
            kind: r.initiatorType,
            startMs: r.startTime,
            durationMs: r.duration,
            transferBytes: r.transferSize,
            encodedBytes: r.encodedBodySize,
          }));
          const field = document.querySelector("#capture-url-0");
          return {
            ttfbMs: nav.responseStart - nav.startTime,
            serverWaitMs: nav.responseStart - nav.requestStart,
            documentMs: nav.responseEnd,
            domContentLoadedMs: nav.domContentLoadedEventEnd,
            loadMs: nav.loadEventEnd,
            shellReadyMs: performance.getEntriesByName("app:document-ready")[0].startTime,
            captureHandlerAttached: field
              ? Object.keys(field).some((key) => key.startsWith("__reactProps"))
              : null,
            paints: performance
              .getEntriesByType("paint")
              .map((p) => ({ name: p.name, ms: p.startTime })),
            resources,
          };
        });
        expect(apiTimings.filter((entry) => entry.status >= 400)).toEqual([]);
        samples.push({
          journey,
          cache,
          slow,
          repeat,
          ...timing,
          api: [...apiTimings],
          headers: [...headers],
        });
        await persist();
      };
      try {
        // Each journey gets an empty HTTP cache, then reloads with a warm cache.
        // The server process stays warm; the first sample retains process warmup.
        for (const [journey, path] of [
          ["open-hub", `/h/${hubId}`],
          ["capture", "/capture"],
          ["collection", `/c/${sourceId}`],
          ["settings", "/settings"],
        ]) {
          await cdp.send("Network.clearBrowserCache");
          await measure(journey, "cold-browser", (p) => p.goto(origin + path));
          await measure(journey, "warm-browser", (p) => p.reload());
        }
        await resetBudget();
        await page.goto(`${origin}/h/${hubId}`);
        await measure("navigate-collection", "warm-browser", async (p) => {
          await Promise.all([
            p.waitForURL(/\/@|\/c\//, { waitUntil: "load" }),
            p.locator("main .collection-row:not([hidden]) h2 a").first().click(),
          ]);
        });
        await resetBudget();
        await page.goto(`${origin}/capture?collection=${sourceId}`);
        await page
          .getByLabel("Link URL", { exact: true })
          .fill(`https://fixture-links.dev/performance/${slow}/${repeat}`);
        await measure("save-link", "warm-browser", async (p) => {
          await Promise.all([
            p.waitForURL(new RegExp(`/c/${sourceId}`), { waitUntil: "load" }),
            p.getByRole("button", { name: "Save link", exact: true }).click(),
          ]);
        });
      } finally {
        await context.close();
      }
    }
  }
}
