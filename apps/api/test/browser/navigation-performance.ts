import { cpus } from "node:os";
import { join } from "node:path";
import { type Browser, expect, type Locator, type Page } from "@playwright/test";
import { type ApiTiming, routeShape } from "./production-performance";

// Opt-in measurements: real production web/API, synthetic data, no external providers.
export async function benchmarkNavigation(input: {
  browser: Browser;
  origin: string;
  cookie: string;
  hubId: string;
  sourceId: string;
  output: string;
  apiTimings: ApiTiming[];
  resetBudget: () => Promise<unknown>;
  fixture: { collections: number; resources: number };
}) {
  const { browser, origin, cookie, hubId, sourceId, output, apiTimings, resetBudget } = input;
  const repeats = 10;
  const samples: Record<string, unknown>[] = [];
  const persist = () =>
    Bun.write(
      join(output, "navigation-performance.json"),
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          variant: process.env.BENCHMARK_VARIANT ?? "working-tree",
          browser: browser.version(),
          bun: Bun.version,
          cpu: cpus()[0]?.model,
          conditions: {
            repeats,
            navigationCompletion:
              "browser animation-frame content check, fonts, two frames; no assertion polling",
            slow: {
              latencyMs: 150,
              downloadBytesPerSecond: 200000,
              uploadBytesPerSecond: 93750,
              cpuRate: 4,
            },
            transport:
              "loopback HTTP; identity encoding; warm server; fresh browser context per repetition",
            fixture: input.fixture,
          },
          samples,
        },
        null,
        2,
      ),
    );
  const painted = (page: Page) =>
    page.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
    );
  const hydrated = async (page: Page) => {
    await page.waitForFunction(() => performance.getEntriesByName("app:document-ready").length > 0);
    await page.evaluate(() => document.fonts.ready);
  };
  // Measure readiness on the browser's animation clock, not Playwright's
  // progressively backed-off assertion polling (which can add hundreds of ms).
  const contentReady = async (page: Page, path: string, selector: string) => {
    const readiness = await page.waitForFunction(
      ({ path, selector }) => {
        const element = document.querySelector(selector);
        return (
          location.pathname === path &&
          !!element?.getClientRects().length &&
          performance.getEntriesByName("app:document-ready").length > 0
        );
      },
      { path, selector },
      { polling: "raf" },
    );
    await readiness.dispose();
    return page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return (
        performance.timeOrigin +
        performance.now() -
        Number(sessionStorage.getItem("benchmark-start"))
      );
    });
  };
  const click = async (locator: Locator) => {
    await expect(locator).toBeVisible();
    await locator.evaluate((element) => {
      sessionStorage.setItem("benchmark-start", String(performance.timeOrigin + performance.now()));
      (element as HTMLElement).click();
    });
  };
  // Warm server routes without warming the measured browser's HTTP cache.
  const warm = await browser.newContext();
  await warm.addCookies([
    { name: "better-auth.session_token", value: cookie.split("=").slice(1).join("="), url: origin },
  ]);
  const warming = await warm.newPage();
  for (const path of [
    "/",
    "/about",
    `/h/${hubId}`,
    `/c/${sourceId}`,
    "/capture",
    "/settings",
    "/settings?section=device",
  ]) {
    await resetBudget();
    await warming.goto(origin + path);
    await hydrated(warming);
  }
  await warm.close();
  for (const slow of [false, true]) {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: "reduce",
      });
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
      type RequestTiming = {
        path: string;
        type: string;
        startMs: number;
        responseMs?: number;
        endMs?: number;
        bytes?: number;
      };
      let networkStart = 0;
      const network = new Map<string, RequestTiming>();
      cdp.on("Network.requestWillBeSent", (event) => {
        if (!measuring) return;
        if (!networkStart) networkStart = event.timestamp;
        network.set(event.requestId, {
          path: routeShape(new URL(event.request.url).pathname),
          type: event.type ?? "Other",
          startMs: (event.timestamp - networkStart) * 1000,
        });
      });
      cdp.on("Network.responseReceived", (event) => {
        const entry = network.get(event.requestId);
        if (entry) entry.responseMs = (event.timestamp - networkStart) * 1000;
      });
      cdp.on("Network.loadingFinished", (event) => {
        const entry = network.get(event.requestId);
        if (entry) {
          entry.endMs = (event.timestamp - networkStart) * 1000;
          entry.bytes = event.encodedDataLength;
        }
      });
      let requests = 0,
        bytes = 0,
        measuring = false;
      page.on("request", () => {
        if (measuring) requests++;
      });
      cdp.on("Network.loadingFinished", ({ encodedDataLength }) => {
        if (measuring) bytes += encodedDataLength;
      });
      const start = async () => {
        await resetBudget();
        apiTimings.length = 0;
        requests = 0;
        bytes = 0;
        network.clear();
        networkStart = 0;
        measuring = true;
      };
      const result = async (journey: string, before: number, elapsedMs?: number) => {
        await painted(page);
        const timing = await page.evaluate(() => ({
          elapsedMs:
            performance.timeOrigin +
            performance.now() -
            Number(sessionStorage.getItem("benchmark-start")),
          timeOrigin: performance.timeOrigin,
        }));
        expect(elapsedMs ?? timing.elapsedMs).toBeGreaterThan(0);
        if (journey !== "theme-visible" && journey !== "hub-to-collection") measuring = false;
        expect(apiTimings.filter((entry) => entry.status >= 400)).toEqual([]);
        samples.push({
          journey,
          slow,
          repeat,
          elapsedMs: elapsedMs ?? timing.elapsedMs,
          documentReplaced: before !== timing.timeOrigin,
          requests,
          network: [...network.values()].map((entry) => ({ ...entry })),
          transferBytes: bytes,
          apiRequests: apiTimings.length,
          apiTotalMs: apiTimings.reduce((sum, entry) => sum + entry.ms, 0),
        });
        await persist();
      };
      const open = async (path: string) => {
        await resetBudget();
        await page.goto(origin + path);
        await hydrated(page);
      };
      try {
        await cdp.send("Network.clearBrowserCache");
        await start();
        await page.goto(origin);
        await hydrated(page);
        await painted(page);
        const first = await page.evaluate(() => ({
          ready: performance.now(),
          origin: performance.timeOrigin,
          fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
        }));
        await result("cold-home", first.origin, first.ready);
        Object.assign(samples[samples.length - 1], { fcpMs: first.fcp });
        await start();
        let before = await page.evaluate(() => performance.timeOrigin);
        await click(
          page.getByRole("contentinfo").getByRole("link", { name: "About ntumie.", exact: true }),
        );
        await result("home-to-about", before, await contentReady(page, "/about", "main h1"));

        await open(`/h/${hubId}`);
        await start();
        before = await page.evaluate(() => performance.timeOrigin);
        await click(page.locator(`main a[href="/c/${sourceId}"]`).first());
        await result(
          "hub-to-collection",
          before,
          await contentReady(page, `/c/${sourceId}`, ".resource-list"),
        );
        await result(
          "collection-discussion-ready",
          before,
          await contentReady(page, `/c/${sourceId}`, "#comments .comments-body"),
        );

        await open("/capture");
        await page.getByLabel("Account menu", { exact: true }).click();
        await start();
        before = await page.evaluate(() => performance.timeOrigin);
        await click(
          page
            .getByRole("navigation", { name: "Account navigation" })
            .getByRole("link", { name: "Settings", exact: true }),
        );
        await result(
          "capture-to-settings",
          before,
          await contentReady(page, "/settings", "#username"),
        );

        await open("/settings?section=device");
        await start();
        before = await page.evaluate(() => performance.timeOrigin);
        await click(page.locator('form[action="/forms/theme"] button[value="light"]'));
        await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await result("theme-visible", before);
        // Persisted completion is reported separately from optimistic visual feedback.
        await expect
          .poll(
            async () => (await context.cookies(origin)).find((c) => c.name === "appearance")?.value,
          )
          .toBe("light");
        await hydrated(page);
        await result("theme-saved", before);
        console.log(
          `Benchmark ${process.env.BENCHMARK_VARIANT}: ${slow ? "slow" : "local"} ${repeat + 1}/${repeats}`,
        );
      } finally {
        await context.close();
      }
    }
  }
  await persist();
}
