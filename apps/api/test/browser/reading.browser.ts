import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { type Browser, expect as browserExpect, chromium, type Page } from "@playwright/test";
import request from "supertest";
import { requestBudgetKey } from "../../src/common/middleware/request-budget";
import type { PrismaService } from "../../src/database/prisma.service";
import { emailConfig } from "../../src/email/config";
import { emailKey, unseal } from "../../src/email/outbox";
import { ensurePersonalHub } from "../../src/modules/hubs/hub-onboarding";
import { itemTags } from "../../src/modules/resources/item-tags";
import { signInHubOwner, signInWithCode } from "../fixtures/sign-in";

const root = resolve(__dirname, "../../../..");
let app: INestApplication;
let prisma: PrismaService;
let browser: Browser;
let web: ReturnType<typeof Bun.spawn>;
let ingress: ReturnType<typeof Bun.serve>;
let directory: string;
let origin: string;
let apiOrigin: string;
let webOrigin = "";
let owner: string;
let cookie: string;
let otherCookie: string;
let hubId: string;
let handle: string;
const publicHubName = "Curious Readers";
const emptyHandle = `empty-${"long".repeat(13)}`;
let hubMode: "normal" | "failure" | "timeout" = "normal";
const hubReads: { path: string; token?: string }[] = [];
let privateId: string;
let sourceId: string;
let targetId: string;
let linkToken: string;
const longTitle = `A reader's reference library ${"LongTitle".repeat(15)}`;
let failCapture = false;
let discoverMode: "normal" | "empty" | "failure" = "normal";
let captureReferer: string | null = null;
let capture: ReturnType<typeof Bun.serve>;
const publicIds: string[] = [];
let delayedDocument: { path: string; started: () => void; released: Promise<void> } | undefined;

async function create(title: string, slug: string, published = false) {
  const result = await request(app.getHttpServer())
    .post("/api/v1/collections")
    .auth(owner, { type: "bearer" })
    .send({
      title,
      slug,
      published,
      description: "Collected notes and practical references.\nA second line for reading.",
    })
    .expect(201);
  return result.body.data.id as string;
}
async function change(id: string, action: string) {
  return request(app.getHttpServer())
    .post(`/api/v1/collections/${id}/${action}`)
    .auth(owner, { type: "bearer" })
    .expect(201);
}
async function freshPage(js = true, timezoneId?: string) {
  const context = await browser.newContext({ javaScriptEnabled: js, timezoneId });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(10000);
  return { page, close: () => context.close() };
}
async function sidebarAlignment(page: Page) {
  return page.locator(".reader-side").evaluate((el) => {
    const summary = el.querySelector(".sidebar-summary")?.getBoundingClientRect();
    const discussion = el.querySelector(".comments")?.getBoundingClientRect();
    if (!summary || !discussion) throw new Error("Sidebar summary or discussion missing");
    return Math.abs(
      discussion.top - summary.bottom - Number.parseFloat(getComputedStyle(el).rowGap),
    );
  });
}
// The harness sets a 2 s resend gap. Without JavaScript the button only
// enables on a fresh render after the gap, so wait it out and reload.
async function waitForResend(page: Page) {
  await page.waitForTimeout(2100);
  await page.reload();
  await browserExpect(
    page.getByRole("button", { name: "Send a new code", exact: true }),
  ).toBeEnabled();
}
async function ready(page: Page, path = "/discover") {
  const response = await page.goto(origin + path, { waitUntil: "domcontentloaded" });
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await browserExpect(page.locator("h1")).toBeVisible();
}

async function documentFrom(source: string, headers: Record<string, string> = {}) {
  // Bun's node:http client currently ignores localAddress. Use Node only for
  // this socket fixture so two actual loopback clients reach the production
  // web entry point; the application and test runner still run under Bun.
  const child = Bun.spawn(
    [
      "node",
      "-e",
      `
    const { request } = require("node:http");
    const { origin, source, headers } = JSON.parse(process.argv[1]);
    const req = request(origin, { localAddress: source, headers }, response => {
      response.pipe(process.stdout);
    });
    req.on("error", () => process.exit(1));
    req.setTimeout(10000, () => req.destroy());
    req.end();
  `,
      JSON.stringify({ origin: `${webOrigin}/discover`, source, headers }),
    ],
    {
      stdout: "pipe",
      stderr: "ignore",
    },
  );
  const body = await new Response(child.stdout).text();
  if (await child.exited) throw new Error("Socket fixture request failed");
  return body;
}

beforeAll(async () => {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.EMAIL_PROVIDER !== "capture" ||
    !new URL(process.env.DATABASE_URL ?? "").pathname.startsWith("/test_")
  )
    throw new Error("Browser tests require isolated capture configuration");
  directory = await mkdtemp(join(tmpdir(), "web-reading-"));
  // Production-shaped path routing: /api reaches Nest; everything else Next.
  ingress = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (delayedDocument?.path === url.pathname) {
        const delayed = delayedDocument;
        delayed.started();
        await delayed.released;
      }
      const upstream = url.pathname.startsWith("/api/") ? apiOrigin : webOrigin;
      if (!upstream) return new Response("Starting", { status: 503 });
      try {
        return await fetch(upstream + url.pathname + url.search, {
          method: req.method,
          headers: (() => {
            const headers = new Headers(req.headers);
            headers.set("accept-encoding", "identity");
            headers.set("x-forwarded-for", server.requestIP(req)?.address ?? "127.0.0.1");
            headers.delete("x-web-read-source");
            return headers;
          })(),
          redirect: "manual",
          body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer(),
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        return new Response("Unavailable", { status: 503 });
      }
    },
  });
  origin = `http://127.0.0.1:${ingress.port}`;
  process.env.BETTER_AUTH_URL = origin;
  const { AppModule } = await import("../../src/app.module.js");
  const { configureApp } = await import("../../src/app.setup.js");
  const { PrismaService: Prisma } = await import("../../src/database/prisma.service.js");
  const { GravatarService } = await import("../../src/modules/avatars/gravatar.service.js");
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GravatarService)
    .useValue({ resolve: async () => null })
    .compile();
  app = module.createNestApplication({ bodyParser: false, logger: false });
  app.use(
    (
      req: { url: string; headers: Record<string, string | undefined> },
      res: {
        status: (code: number) => { json: (body: unknown) => void };
        setHeader: (name: string, value: string) => void;
        destroy: () => void;
      },
      next: () => void,
    ) => {
      if (req.url === "/api/v1/capture" && failCapture) {
        res.status(503).json({ error: { code: "service_unavailable" } });
        return;
      }
      if (req.url.startsWith("/api/v1/hubs/")) {
        hubReads.push({ path: req.url, token: req.headers["x-share-token"] });
        if (hubMode !== "normal" && !req.url.includes("/collections/")) {
          const fail = () =>
            res
              .status(503)
              .json({ error: { code: "service_unavailable", message: "PRIVATE HUB DETAIL" } });
          if (hubMode === "timeout") setTimeout(fail, 8500);
          else fail();
          return;
        }
      }
      if (req.url.startsWith("/api/v1/discover") && discoverMode !== "normal") {
        if (discoverMode === "empty")
          res.status(200).json({ data: [], meta: { limit: 20, nextCursor: null } });
        else
          res
            .status(503)
            .json({ error: { code: "service_unavailable", message: "PRIVATE INTERNAL DETAIL" } });
      } else next();
    },
  );
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  apiOrigin = await app.getUrl();
  prisma = app.get(Prisma);
  const signed = await signInHubOwner(app.getHttpServer(), {
    email: "reader-owner@example.com",
    name: "Reader",
  });
  owner = signed.headers["set-auth-token"];
  cookie =
    (signed.headers["set-cookie"] as unknown as string[])
      .map((value) => value.split(";")[0])
      .find((value) => value.startsWith("better-auth.session_token=")) ?? "";
  expect(cookie).not.toBe("");
  const profile = await request(app.getHttpServer())
    .get("/api/v1/profile")
    .auth(owner, { type: "bearer" })
    .expect(200);
  hubId = profile.body.data.hubId;
  handle = profile.body.data.handle;
  await prisma.hub.update({
    where: { id: hubId },
    data: {
      name: publicHubName,
      description: "References for curious readers.\nCollected with care.",
    },
  });
  const other = await signInHubOwner(app.getHttpServer(), {
    email: "empty-reader@example.com",
    name: "Other reader",
  });
  const otherToken = other.headers["set-auth-token"];
  otherCookie =
    (other.headers["set-cookie"] as unknown as string[])
      .map((value) => value.split(";")[0])
      .find((value) => value.startsWith("better-auth.session_token=")) ?? "";
  await request(app.getHttpServer())
    .patch("/api/v1/profile")
    .auth(otherToken, { type: "bearer" })
    .send({ handle: emptyHandle, confirmHandle: true })
    .expect(200);
  await request(app.getHttpServer())
    .post("/api/v1/collections")
    .auth(otherToken, { type: "bearer" })
    .send({ slug: "private-reading", title: "Other private collection" })
    .expect(201);
  for (let i = 0; i < 23; i++)
    publicIds.push(await create(`Reading collection ${i + 1}`, `reading-${i}`, true));
  sourceId = await create(longTitle, "reading-guide", true);
  publicIds.push(sourceId);
  privateId = await create("Private title should never leak", "private-reading");
  targetId = await create("A useful collection", "useful-collection", true);
  await request(app.getHttpServer())
    .post(`/api/v1/collections/${sourceId}/resources/collection`)
    .auth(owner, { type: "bearer" })
    .send({ linkedCollectionId: targetId, position: 0 })
    .expect(201);
  const resources = await request(app.getHttpServer())
    .get(`/api/v1/collections/${sourceId}/resources`)
    .auth(owner, { type: "bearer" })
    .expect(200);
  const referenceResource = resources.body.data.find(
    (item: { linkedCollectionId: string }) => item.linkedCollectionId === targetId,
  );
  await request(app.getHttpServer())
    .patch(`/api/v1/collections/${sourceId}/resources/${referenceResource.id}`)
    .auth(owner, { type: "bearer" })
    .send({ tags: ["reference-tag"], version: referenceResource.version })
    .expect(200);
  capture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/reference") captureReferer = req.headers.get("referer");
      return new Response("External reference opened");
    },
  });
  // The referrer check opens a local test server, an address the API refuses
  // to save, so this one link is written directly. Titles are resolved from
  // pages (disabled under test); store them as a lookup would.
  const lookedUp = (url: string, title: string) =>
    prisma.linkMetadata.upsert({
      where: { url },
      create: { url, title, state: "ready", fetchedAt: new Date() },
      update: { title, state: "ready", fetchedAt: new Date() },
    });
  const referenceUrl = `http://127.0.0.1:${capture.port}/reference`;
  await prisma.resource.create({
    data: { collectionId: sourceId, kind: "external_link", url: referenceUrl, position: 1 },
  });
  await lookedUp(referenceUrl, "Open the reference");
  for (let position = 2; position < 22; position++) {
    const added = await request(app.getHttpServer())
      .post(`/api/v1/collections/${sourceId}/resources/external`)
      .auth(owner, { type: "bearer" })
      .send({
        url: `https://fixture-links.dev/reference/${position}`,
        position,
        tags: position === 21 ? ["late-page-tag", "reading", "reference"] : [],
      })
      .expect(201);
    await lookedUp(added.body.data.url, `Reference ${position}`);
  }
  const link = await request(app.getHttpServer())
    .put(`/api/v1/collections/${sourceId}/link-sharing`)
    .auth(owner, { type: "bearer" })
    .send({ enabled: true })
    .expect(200);
  linkToken = link.body.data.token;
  const reserved = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reserved.port;
  await reserved.stop(true);
  webOrigin = `http://127.0.0.1:${port}`;
  web = Bun.spawn(["bun", "server.ts"], {
    cwd: resolve(root, "apps/web"),
    env: {
      ...process.env,
      NODE_ENV: "production",
      API_INTERNAL_ORIGIN: apiOrigin,
      WEB_PORT: String(port),
      WEB_TRUSTED_PROXY_CIDRS: "127.0.0.1",
    },
    stdout: Bun.file(join(directory, "web.log")),
    stderr: Bun.file(join(directory, "web-error.log")),
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (web.exitCode !== null) throw new Error("Web fixture exited before readiness");
    try {
      if ((await fetch(webOrigin, { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {}
    if (attempt === 99) throw new Error("Web fixture did not become ready");
    await Bun.sleep(100);
  }
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_CHROME_PATH ??
      (!process.env.CI && existsSync("/usr/bin/google-chrome-stable")
        ? "/usr/bin/google-chrome-stable"
        : undefined),
    args: ["--no-sandbox"],
    ignoreDefaultArgs: ["--disable-back-forward-cache"],
  });
}, 60000);

beforeEach(async () => {
  await prisma.requestBudget.deleteMany();
});
afterAll(async () => {
  await browser?.close();
  if (web) {
    web.kill();
    const timer = setTimeout(() => web.kill("SIGKILL"), 2000);
    await web.exited;
    clearTimeout(timer);
  }
  await ingress?.stop(true);
  await capture?.stop(true);
  // The fixture owns this listener. Native-form fetches can leave pooled HTTP
  // connections after the web child stops; close them before Nest awaits shutdown.
  app?.getHttpServer().closeAllConnections();
  await app?.close();
  if (directory) {
    const output = await readFile(join(directory, "web.log"), "utf8").catch(() => "");
    if (linkToken) expect(output).not.toContain(linkToken);
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);

describe("explore to resource: production browser journey", () => {
  it("introduces the product with working discovery and a responsive system theme", async () => {
    for (const js of [true, false]) {
      const { page, close } = await freshPage(js);
      try {
        for (const theme of ["dark", "light"] as const) {
          await page.emulateMedia({ colorScheme: theme });
          await ready(page, "/");
          await browserExpect(page).toHaveTitle("nslinkhub · Useful links, collected and shared");
          await browserExpect(page.locator("html")).toHaveAttribute("data-theme", "system");
          await browserExpect(page.getByRole("figure")).toContainText("Example");
          for (const width of [320, 390, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            ).toBe(true);
          }
          const logo = await page.locator(".wordmark").boundingBox();
          const nav = await page.locator(".primary-nav").boundingBox();
          expect(logo && nav && nav.x > logo.x + logo.width + 100).toBeTruthy();
          expect(
            await page.locator("main").evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
          ).toBe(true);
          if (js)
            await page.screenshot({ path: `/tmp/landing-${theme}-desktop.png`, fullPage: true });
          await page.setViewportSize({ width: 390, height: 844 });
          if (js)
            await page.screenshot({ path: `/tmp/landing-${theme}-phone.png`, fullPage: true });
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
          });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "";
          });
        }
        await page
          .getByRole("link", { name: "Discover the links someone kept", exact: true })
          .click();
        await browserExpect(page).toHaveURL(`${origin}/discover`);
        await browserExpect(page.locator("h1")).toHaveText(
          "Someone already found your next good read.",
        );
        await page.locator(".wordmark").click();
        await browserExpect(page).toHaveURL(`${origin}/`);
        await page
          .locator(".landing-actions")
          .getByRole("link", { name: "Sign in", exact: true })
          .click();
        await browserExpect(page).toHaveURL(`${origin}/sign-in`);
      } finally {
        await close();
      }
    }
  }, 30000);

  it("types landing questions, holds each, loops back to the first, and respects reduced motion", async () => {
    const { page, close } = await freshPage();
    try {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await ready(page, "/");
      await browserExpect(page.locator(".question-text")).toHaveText("A reading list?|");
      const height = await page
        .locator(".typed-question")
        .evaluate((el) => el.getBoundingClientRect().height);
      const holdStarted = Date.now();
      await page.waitForTimeout(2000);
      await browserExpect(page.locator(".question-text")).toHaveText("A reading list?|");
      await browserExpect(page.locator(".question-text")).not.toHaveText("A reading list?|");
      // The hold (3.2 s) starts slightly before this test observes the full text.
      expect(Date.now() - holdStarted).toBeGreaterThanOrEqual(2500);
      await browserExpect(page.locator(".question-text")).toHaveText(
        "A little corner of the web worth sharing?|",
        { timeout: 12000 },
      );
      expect(
        await page.locator(".typed-question").evaluate((el) => el.getBoundingClientRect().height),
      ).toBe(height);
      await browserExpect(page.locator(".question-text")).toHaveText("A reading list?|", {
        timeout: 12000,
      });
      await browserExpect(page.getByRole("button", { name: /question animation/ })).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await browserExpect(page.locator(".question-animation")).toBeHidden();
      await browserExpect(page.locator(".question-static")).toBeVisible();
    } finally {
      await close();
    }
  }, 30000);

  it("keeps readiness available for monitoring without a client status page", async () => {
    const api = await request(app.getHttpServer()).get("/api/v1/status").expect(200);
    expect(api.body.data.status).toBe("ready");
    const { page, close } = await freshPage();
    try {
      await ready(page);
      await browserExpect(page.locator(".wordmark")).toHaveAttribute("href", "/");
      await browserExpect(page).toHaveTitle("Discover · nslinkhub");
      await browserExpect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: "Discover", exact: true }),
      ).toHaveAttribute("href", "/discover");
      const footer = page.getByRole("contentinfo");
      await browserExpect(footer.locator(".footer-brand")).toHaveText(
        `© ${new Date().getFullYear()} nslinkhub`,
      );
      await browserExpect(footer.locator(".footer-series")).toHaveText("an ns series product");
      await browserExpect(footer.getByRole("link", { name: "Discover", exact: true })).toHaveCount(
        0,
      );
      await browserExpect(footer.getByRole("link")).toHaveCount(1);
      await browserExpect(
        footer
          .getByRole("navigation", { name: "Footer" })
          .getByRole("link", { name: "Support", exact: true }),
      ).toHaveAttribute("href", "/support");
      await browserExpect(page.locator('a[href="/status"]')).toHaveCount(0);
      const response = await page.goto(`${origin}/status`);
      expect(response?.status()).toBe(404);
    } finally {
      await close();
    }
  }, 15000);

  it("recovers cancelled document navigation with fresh authorization", async () => {
    const { page, close } = await freshPage();
    let release = () => {};
    let unpublished = false;
    try {
      for (const entry of [`/c/${sourceId}`, `/@${handle}/reading-guide`]) {
        for (const revoke of [false, true]) {
          await ready(page, entry);
          let started = () => {};
          const waiting = new Promise<void>((resolve) => {
            started = resolve;
          });
          const released = new Promise<void>((resolve) => {
            release = resolve;
          });
          delayedDocument = { path: `/c/${targetId}`, started, released };
          const aborted = page.waitForEvent("requestfailed", {
            predicate: (req) =>
              req.isNavigationRequest() && req.url() === `${origin}/c/${targetId}`,
          });
          await page
            .getByRole("link", { name: "A useful collection", exact: true })
            .click({ noWaitAfter: true });
          await waiting;
          await page.keyboard.press("Escape");
          // Headless key dispatch does not invoke Chromium's browser-chrome
          // Stop command. Drive that native cancellation explicitly as well.
          const protocol = await page.context().newCDPSession(page);
          await protocol.send("Page.stopLoading");
          await protocol.detach();
          expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
          await browserExpect(page.locator(".navigation-loading .skeleton-row")).toHaveCount(0);
          await browserExpect(page.getByRole("status")).toHaveText("Loading page…");
          expect(page.url()).toBe(origin + entry);
          await browserExpect(page.locator("h1")).toBeHidden();
          if (revoke) {
            await change(sourceId, "unpublish");
            unpublished = true;
          }
          delayedDocument = undefined;
          release();
          const reload = page.getByRole("button", { name: "Reload this page", exact: true });
          if (!revoke) await page.screenshot({ path: "/tmp/w3-navigation-recovery.png" });
          await reload.focus();
          await browserExpect(reload).toBeFocused();
          await Promise.all([
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
            reload.press("Enter"),
          ]);
          await browserExpect(page.locator("h1")).toHaveText(
            revoke ? "This collection isn't available." : longTitle,
          );
          await browserExpect(page.locator(".navigation-loading")).toBeHidden();
          if (revoke) {
            await browserExpect(page.locator(".resource-row")).toHaveCount(0);
            await change(sourceId, "publish");
            unpublished = false;
          }
        }
      }
    } finally {
      delayedDocument = undefined;
      release();
      if (unpublished) await change(sourceId, "publish");
      await close();
    }
  }, 20000);

  it("browses public hubs as anonymous, owner and another user without private data", async () => {
    for (const session of [undefined, cookie, otherCookie]) {
      const { page, close } = await freshPage();
      try {
        await page.setViewportSize({ width: 390, height: 844 });
        if (session) {
          const [name, ...value] = session.split("=");
          await page.context().addCookies([{ name, value: value.join("="), url: origin }]);
        }
        await ready(page, `/@${handle}?view=public&s=discovery-must-ignore-this`);
        await browserExpect(page.locator("h1")).toHaveText(publicHubName);
        await browserExpect(page).toHaveTitle(`${publicHubName} · nslinkhub`);
        await browserExpect(page.locator(".hub-identity")).toHaveText(`@${handle} by Reader`);
        await browserExpect(page.locator(".hub-collections-heading .meta")).toHaveText("25");
        await browserExpect(page.locator(".hub-heading time")).toHaveCount(0);
        await browserExpect(page.locator(".hub-heading")).not.toContainText("Created");
        await browserExpect(page.locator(".hub-heading")).not.toContainText("Updated");
        if (!session)
          await page.screenshot({ path: "/tmp/public-hub-metadata-mobile.png", fullPage: true });
        await browserExpect(
          page.getByText("References for curious readers.", { exact: false }),
        ).toBeVisible();
        await browserExpect(page.locator(".collection-row")).toHaveCount(20);
        const more = page.getByRole("link", { name: "More collections", exact: true });
        await more.focus();
        await more.press("Enter");
        await browserExpect(page.locator(".collection-row")).toHaveCount(25);
        await browserExpect(
          page.getByRole("link", { name: "All collections loaded" }),
        ).toBeFocused();
        await browserExpect(page.locator('p[aria-live="polite"]')).toHaveText(
          "5 more collections loaded.",
        );
        await browserExpect(page.locator("body")).not.toContainText("Private title");
        await browserExpect(page.locator("body")).not.toContainText("Other private");
        await browserExpect(
          page.getByRole("link", { name: "A useful collection", exact: true }),
        ).toHaveCount(1);
        await browserExpect(
          page.getByRole("link", { name: longTitle, exact: true }),
        ).toHaveAttribute("href", `/@${handle}/reading-guide`);
        await ready(page, `/@${emptyHandle}?view=public`);
        await browserExpect(page.locator(".hub-collections-heading .meta")).toHaveText("0");
        await browserExpect(page.getByText("No published collections here yet.")).toBeVisible();
        await browserExpect(page.locator(".collection-row")).toHaveCount(0);
        await browserExpect(page.locator("body")).not.toContainText("Other private");
        if (!session) {
          for (const colorScheme of ["light", "dark"] as const) {
            await page.emulateMedia({ colorScheme });
            for (const width of [390, 1280]) {
              await page.setViewportSize({ width, height: 900 });
              const heading = await page.locator(".hub-collections-heading").boundingBox();
              const empty = await page.locator(".empty").boundingBox();
              expect(heading && empty && empty.y - heading.y - heading.height < 48).toBeTruthy();
              expect(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
              ).toBe(true);
              await page.screenshot({ path: `/tmp/hub-empty-${colorScheme}-${width}.png` });
            }
          }
        }
        expect(
          hubReads
            .filter((read) => !read.path.includes("/collections/"))
            .every((read) => !read.token && !read.path.includes("s=")),
        ).toBe(true);
      } finally {
        await close();
      }
    }
  }, 30000);

  it("keeps own hub pagination at stable and handle addresses", async () => {
    const { page, close } = await freshPage(false);
    try {
      const [name, ...value] = cookie.split("=");
      await page.context().addCookies([{ name, value: value.join("="), url: origin }]);
      const first = await request(app.getHttpServer())
        .get(`/api/v1/hubs/${hubId}/collections`)
        .set("Cookie", cookie)
        .expect(200);
      const cursor = first.body.meta.nextCursor;
      expect(cursor).toBeTruthy();
      const second = await request(app.getHttpServer())
        .get(`/api/v1/hubs/${hubId}/collections?cursor=${encodeURIComponent(cursor)}`)
        .set("Cookie", cookie)
        .expect(200);
      for (const path of [`/h/${hubId}`, `/@${handle}`]) {
        await ready(page, `${path}?cursor=${encodeURIComponent(cursor)}`);
        await browserExpect(
          page.getByRole("heading", { name: "Your collections", exact: true }),
        ).toBeVisible();
        await browserExpect(page.locator(".collection-row")).toHaveCount(second.body.data.length);
        await browserExpect(page.locator(".collection-row").first()).toContainText(
          second.body.data[0].title,
        );
      }
      await ready(page, `/h/${hubId}?view=public`);
      const more = page.getByRole("link", { name: "More collections", exact: true });
      await browserExpect(more).toHaveAttribute("href", /view=public/);
      await more.click();
      await browserExpect(
        page.getByRole("heading", { name: "Published collections", exact: true }),
      ).toBeVisible();
      await browserExpect(page.locator("body")).not.toContainText("Private title");
    } finally {
      await close();
    }
  }, 20000);

  it("omits public hub attribution when the owner has no name", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "reader-owner@example.com" },
    });
    const { page, close } = await freshPage(false);
    try {
      for (const name of ["", "   "]) {
        await prisma.user.update({ where: { id: user.id }, data: { name } });
        for (const path of [`/h/${hubId}`, `/@${handle}`]) {
          await ready(page, path);
          await browserExpect(page.locator("h1")).toHaveText(publicHubName);
          await browserExpect(page.locator(".hub-identity")).toHaveText(`@${handle}`);
          await browserExpect(page.locator("body")).not.toContainText(user.email);
        }
      }
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { name: user.name } });
      await close();
    }
  }, 15000);

  it("follows hub, pretty URL, reference and external resource with keyboard, narrow widths and no JavaScript", async () => {
    for (const js of [true, false]) {
      const { page, close } = await freshPage(js);
      try {
        await ready(page, `/@${handle}`);
        for (const width of [320, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
        }
        if (js) {
          await page.screenshot({ path: "/tmp/w3-hub-desktop.png" });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: "/tmp/w3-hub-phone.png" });
        } else {
          await page.getByRole("link", { name: "More collections", exact: true }).click();
          await browserExpect(page.locator(".collection-row")).toHaveCount(5);
          await ready(page, `/@${handle}`);
        }
        const collection = page.getByRole("link", { name: longTitle, exact: true });
        await collection.focus();
        await collection.press("Enter");
        expect(new URL(page.url()).pathname).toBe(`/@${handle}/reading-guide`);
        await browserExpect(page.locator("h1")).toHaveText(longTitle);
        await page.reload();
        await browserExpect(page.locator(".resource-row")).toHaveCount(20);
        if (js) {
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
          });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "";
          });
        }
        await page.getByRole("link", { name: "More resources", exact: true }).click();
        await browserExpect(page.locator(".resource-row")).toHaveCount(js ? 22 : 2);
        await ready(page, `/@${handle}/reading-guide`);
        await page.getByRole("link", { name: "A useful collection", exact: true }).click();
        expect(new URL(page.url()).pathname).toBe(`/c/${targetId}`);
        await browserExpect(page.locator("h1")).toHaveText("A useful collection");
        await page.getByRole("link", { name: `@${handle}`, exact: true }).click();
        await page.getByRole("link", { name: longTitle }).click();
        await page.getByRole("link", { name: "Open the reference", exact: true }).click();
        await browserExpect(page.locator("body")).toHaveText("External reference opened");
        expect(captureReferer).toBeNull();
      } finally {
        await close();
      }
    }
  }, 40000);

  it("keeps hub continuation context through throttling, timeout, duplicates and invalid cursors", async () => {
    const { page, close } = await freshPage();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await ready(page, `/@${handle}`);
      const pattern = `**/api/v1/hubs/${hubId}?**`;
      await page.route(
        pattern,
        (route) =>
          route.fulfill({
            status: 429,
            headers: { "Retry-After": "1" },
            json: { error: { code: "too_many_requests", message: "PRIVATE RAW ERROR" } },
          }),
        { times: 1 },
      );
      await page.getByRole("link", { name: "More collections", exact: true }).click();
      await browserExpect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
      await browserExpect(page.locator(".collection-row")).toHaveCount(20);
      await page.route(
        pattern,
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 11000));
          await route.abort().catch(() => {});
        },
        { times: 1 },
      );
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await browserExpect(
        page.getByText("Couldn't load more. Your current results are still here."),
      ).toBeVisible({ timeout: 12000 });
      await browserExpect(page.locator(".collection-row")).toHaveCount(20);
      await page.route(
        pattern,
        async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.collections.push(body.data.collections[0]);
          await route.fulfill({ response, json: body });
        },
        { times: 1 },
      );
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await browserExpect(page.locator(".collection-row")).toHaveCount(25);
      await browserExpect(page.locator('p[aria-live="polite"]')).toHaveText(
        "5 more collections loaded.",
      );
      await ready(page, `/@${handle}`);
      await page.route(
        pattern,
        (route) => route.fulfill({ status: 400, json: { error: { code: "invalid_cursor" } } }),
        { times: 1 },
      );
      await page.getByRole("link", { name: "More collections", exact: true }).click();
      await page.getByRole("link", { name: "Reload list", exact: true }).click();
      expect(new URL(page.url()).pathname).toBe(`/@${handle}`);
      await browserExpect(page.locator(".collection-row")).toHaveCount(20);
      await ready(page, `/@${handle}?cursor=invalid`);
      await browserExpect(page.locator("h1")).toHaveText("This list has changed.");
      await page.getByRole("link", { name: "Reload collections", exact: true }).click();
      expect(new URL(page.url()).pathname).toBe(`/@${handle}`);
      await ready(page, `/@${handle}/reading-guide?cursor=invalid`);
      await page.getByRole("link", { name: "Reload collection", exact: true }).click();
      expect(new URL(page.url()).pathname).toBe(`/@${handle}/reading-guide`);
    } finally {
      await close();
    }
  }, 30000);

  it("keeps immutable ID links readable after handle and slug renames", async () => {
    const { page, close } = await freshPage();
    const renamed = "renamed-reader";
    async function renameSlug(slug: string) {
      const current = await request(app.getHttpServer())
        .get(`/api/v1/collections/${sourceId}`)
        .auth(owner, { type: "bearer" })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/collections/${sourceId}`)
        .auth(owner, { type: "bearer" })
        .send({ slug, version: current.body.data.version })
        .expect(200);
    }
    try {
      await ready(page, `/@${handle}/reading-guide`);
      await request(app.getHttpServer())
        .patch("/api/v1/profile")
        .auth(owner, { type: "bearer" })
        .send({ handle: renamed, confirmHandle: true })
        .expect(200);
      await renameSlug("renamed-guide");
      await ready(page, `/@${renamed}/renamed-guide`);
      await browserExpect(page.locator("h1")).toHaveText(longTitle);
      await ready(page, `/c/${sourceId}`);
      await browserExpect(page.locator("h1")).toHaveText(longTitle);
      await browserExpect(
        page.getByRole("link", { name: `@${renamed}`, exact: true }),
      ).toBeVisible();
      for (const path of [`/@${handle}/reading-guide`, `/@${renamed}/reading-guide`]) {
        await ready(page, path);
        await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
      }
    } finally {
      // Restore this shared synthetic fixture; product clients cannot unclaim handles.
      await prisma.hub.update({ where: { id: hubId }, data: { handleClaimedAt: null } });
      await prisma.hub.update({ where: { id: hubId }, data: { handle } });
      await renameSlug("reading-guide");
      await close();
    }
  }, 20000);

  it("fails safely for invalid routes and hub lookup failures, retaining authorized ID reading", async () => {
    const { page, close } = await freshPage();
    try {
      for (const path of ["/@missing-reader", "/@ab", "/@bad%2Fhandle"]) {
        await ready(page, path);
        await browserExpect(page.locator("h1")).toHaveText("This hub isn't available.");
      }
      for (const path of [
        `/@${handle}/private-reading`,
        `/@${handle}/missing`,
        `/@${emptyHandle}/reading-guide`,
        `/@${handle}/bad%2Fslug`,
      ]) {
        await ready(page, path);
        await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
        await browserExpect(page.locator("body")).not.toContainText("Private title");
      }
      for (const path of [
        "/not-a-page",
        "/unrelated/reading-guide",
        `/@${handle}/reading-guide/useful-collection`,
      ]) {
        await ready(page, path);
        await browserExpect(page.locator("h1")).toHaveText("This page isn't available.");
      }
      hubMode = "failure";
      await ready(page, `/@${handle}/reading-guide`);
      await browserExpect(page.locator("h1")).toHaveText("We couldn't load this page.");
      await browserExpect(page.locator("body")).not.toContainText(longTitle);
      await browserExpect(page.locator("body")).not.toContainText("PRIVATE HUB DETAIL");
      await ready(page, `/c/${sourceId}`);
      await browserExpect(page.locator("h1")).toHaveText(longTitle);
      await browserExpect(page.getByRole("link", { name: `@${handle}`, exact: true })).toHaveCount(
        0,
      );
      hubMode = "timeout";
      await ready(page, `/@${handle}`);
      await browserExpect(page.locator("h1")).toHaveText("We couldn't load this page.");
      hubMode = "normal";
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText(publicHubName);
    } finally {
      hubMode = "normal";
      await close();
    }
  }, 25000);

  it("revalidates pretty history and scopes shared access away from public hub discovery", async () => {
    const { page, close } = await freshPage();
    try {
      await ready(page, `/@${handle}/reading-guide`);
      await page.getByRole("link", { name: `@${handle}`, exact: true }).click();
      await change(sourceId, "unpublish");
      await page.goBack();
      await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
      await ready(page, `/@${handle}/reading-guide?s=${linkToken}`);
      await browserExpect(page.locator("h1")).toHaveText(longTitle);
      await browserExpect(
        page.getByRole("link", { name: `@${handle}`, exact: true }),
      ).toHaveAttribute("href", `/h/${hubId}`);
      expect(
        hubReads
          .filter((read) => !read.path.includes("/collections/"))
          .every((read) => !read.token && !read.path.includes("s=")),
      ).toBe(true);
      await page.getByRole("link", { name: "A useful collection", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("s")).toBeNull();
      await browserExpect(page.locator("h1")).toHaveText("A useful collection");
      const previousToken = linkToken;
      const rotated = await request(app.getHttpServer())
        .put(`/api/v1/collections/${sourceId}/link-sharing`)
        .auth(owner, { type: "bearer" })
        .send({ enabled: true, rotate: true })
        .expect(200);
      linkToken = rotated.body.data.token;
      await ready(page, `/@${handle}/reading-guide?s=${previousToken}`);
      await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
      await ready(page, `/@${handle}`);
      await browserExpect(page.getByRole("link", { name: longTitle, exact: true })).toHaveCount(0);
    } finally {
      await change(sourceId, "publish");
      await close();
    }
  }, 20000);

  it("isolates SSR client budgets and refuses forged source attribution", async () => {
    const key = (source: string) =>
      requestBudgetKey("read", source, process.env.BETTER_AUTH_SECRET ?? "");
    const first = "127.0.0.2";
    const second = "127.0.0.3";
    expect(await documentFrom(first)).toContain('class="collection-row"');
    expect(await documentFrom(second)).toContain('class="collection-row"');
    expect(await prisma.requestBudget.findUnique({ where: { key: key(first) } })).toMatchObject({
      count: 1,
    });
    expect(await prisma.requestBudget.findUnique({ where: { key: key(second) } })).toMatchObject({
      count: 1,
    });
    await prisma.requestBudget.update({ where: { key: key(first) }, data: { count: 300 } });
    const denied = await documentFrom(first, {
      "x-forwarded-for": second,
      "x-web-read-source": "forged-proof",
    });
    expect(denied).not.toContain('class="collection-row"');
    expect(await documentFrom(second)).toContain('class="collection-row"');
    expect(await prisma.requestBudget.findUnique({ where: { key: key(second) } })).toMatchObject({
      count: 2,
    });
    // A trusted ingress can append its actual source, but an arbitrary leftmost
    // header still cannot impersonate another visitor.
    expect(
      await documentFrom("127.0.0.1", { "x-forwarded-for": `${second}, ${first}` }),
    ).not.toContain('class="collection-row"');
    await prisma.requestBudget.deleteMany();
    await request(app.getHttpServer())
      .get("/api/v1/discover")
      .set("x-web-read-source", "forged-proof")
      .expect(200);
    const direct = await prisma.requestBudget.findFirstOrThrow();
    await prisma.requestBudget.update({ where: { key: direct.key }, data: { count: 300 } });
    await request(app.getHttpServer())
      .get("/api/v1/discover")
      .set("x-web-read-source", "different-forged-proof")
      .set("x-forwarded-for", second)
      .expect(429);
  });

  it("fits desktop collection pages to the frame and keeps mobile scrolling", async () => {
    const { page, close } = await freshPage();
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await ready(page);
      const rows = page.locator(".collection-row:visible"),
        main = page.locator("main");
      const footer = page.getByRole("contentinfo"),
        initialFooter = await footer.boundingBox();
      await browserExpect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(20);
      expect(await main.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      const title = await rows.first().textContent();
      await page.getByRole("button", { name: "Next", exact: true }).click();
      expect(await rows.first().textContent()).not.toBe(title);
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      expect(await rows.first().textContent()).toBe(title);
      expect(await footer.boundingBox()).toEqual(initialFooter);
      await page.screenshot({ path: "/tmp/explore-frame-desktop.png" });
      await page.setViewportSize({ width: 1280, height: 660 });
      await browserExpect.poll(() => rows.count()).toBeLessThan(count);
      expect(await main.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      await browserExpect(
        page.getByRole("link", { name: "More collections", exact: true }),
      ).toBeVisible();
      await main.focus();
      await page.keyboard.press("PageDown");
      await browserExpect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await page.getByRole("link", { name: "More collections", exact: true }).click();
      await browserExpect(page.locator(".collection-row")).toHaveCount(25);
      await browserExpect(footer).not.toBeInViewport();
      await footer.scrollIntoViewIfNeeded();
      await browserExpect(footer).toBeInViewport();
      await page.screenshot({ path: "/tmp/explore-frame-phone.png" });
      await page.setViewportSize({ width: 844, height: 390 });
      await footer.scrollIntoViewIfNeeded();
      await browserExpect(footer).toBeInViewport();
    } finally {
      await close();
    }
  }, 20000);

  it("loads more, keeps focus, supports no-JavaScript continuation and renders safe empty state", async () => {
    const { page, close } = await freshPage();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await ready(page);
      await browserExpect(page.locator(".collection-row")).toHaveCount(20);
      const more = page.getByRole("link", { name: "More collections", exact: true });
      await more.focus();
      await more.press("Enter");
      await browserExpect(page.locator(".collection-row")).toHaveCount(25);
      await browserExpect(page.getByRole("link", { name: "All collections loaded" })).toBeFocused();
      await browserExpect(page.locator('p[aria-live="polite"]')).toHaveText(
        "5 more collections loaded.",
      );
      await page.goto(`${origin}/discover?cursor=invalid`);
      await browserExpect(page.locator("h1")).toHaveText("This list has changed.");
    } finally {
      await close();
    }
    const plain = await freshPage(false);
    try {
      await ready(plain.page);
      await plain.page.getByRole("link", { name: "More collections", exact: true }).click();
      await browserExpect(plain.page.locator(".collection-row")).toHaveCount(5);
      await ready(plain.page, `/c/${sourceId}`);
      await plain.page.getByRole("link", { name: "More resources", exact: true }).click();
      await browserExpect(plain.page.locator(".resource-row")).toHaveCount(2);
    } finally {
      await plain.close();
    }
  }, 20000);

  it("reads collection references, wraps at all target widths and supports keyboard navigation", async () => {
    const { page, close } = await freshPage();
    try {
      await ready(page, `/c/${sourceId}`);
      await browserExpect(page.locator(".resource-row")).toHaveCount(20);
      await browserExpect(page.locator(".collection-heading .resource-tag-count")).toHaveText(
        "+1 tag",
      );
      await browserExpect(page.locator(".sheet-body")).not.toContainText("late-page-tag");
      for (const width of [320, 390, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({ path: `/tmp/collection-tag-preview-${width}.png` });
      }
      await browserExpect(page.locator(".resource-row")).toHaveCount(20);
      await page.getByRole("link", { name: "More resources", exact: true }).click();
      await browserExpect(page.locator(".resource-row")).toHaveCount(22);
      await browserExpect(page.getByRole("link", { name: "All resources loaded" })).toBeFocused();
      await page.goto(`${origin}/c/${sourceId}?cursor=invalid`);
      await browserExpect(page.locator("h1")).toHaveText("This list has changed.");
      await page.getByRole("link", { name: "Reload collection", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText(longTitle);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      const contrast = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        const probe = document.createElement("span");
        document.body.appendChild(probe);
        const luminance = (token: string) => {
          probe.style.color = `var(${token})`;
          ctx.fillStyle = getComputedStyle(probe).color;
          ctx.fillRect(0, 0, 1, 1);
          const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((value) => {
              const v = value / 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const previous = document.documentElement.dataset.theme;
        try {
          return ["light", "dark"].flatMap((theme) => {
            document.documentElement.dataset.theme = theme;
            return [
              ["--color-ink", "--color-canvas"],
              ["--color-muted", "--color-surface"],
              ["--color-primary", "--color-canvas"],
            ].map(([fg, bg]) => {
              const a = luminance(fg),
                b = luminance(bg);
              return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            });
          });
        } finally {
          document.documentElement.dataset.theme = previous ?? "system";
          probe.remove();
        }
      });
      expect(contrast.every((ratio) => ratio >= 4.5)).toBe(true);
      await page.screenshot({ path: "/tmp/w3-reader-desktop.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "/tmp/w3-reader-phone.png", fullPage: true });
      await browserExpect(
        page.locator(".sheet-body").getByText("reference-tag", { exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "A useful collection", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("A useful collection");
      await browserExpect(page.getByText("No resources in this collection yet.")).toBeVisible();
      await ready(page, `/c/${sourceId}`);
      await page.getByRole("link", { name: "Open the reference", exact: true }).click();
      await browserExpect(page.locator("body")).toHaveText("External reference opened");
      expect(captureReferer).toBeNull();
    } finally {
      await close();
    }
  }, 20000);

  it("handles continuation failures and Retry-After without losing existing results", async () => {
    const { page, close } = await freshPage();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await ready(page);
      await page.route(
        "**/api/v1/discover?**",
        (route) =>
          route.fulfill({
            status: 429,
            headers: { "Retry-After": "1", "content-type": "application/json" },
            body: JSON.stringify({
              error: { code: "too_many_requests", message: "PRIVATE RAW ERROR" },
            }),
          }),
        { times: 1 },
      );
      await page.getByRole("link", { name: "More collections", exact: true }).click();
      await browserExpect(page.locator(".collection-row")).toHaveCount(20);
      await browserExpect(page.getByRole("button", { name: /Try again in/ })).toBeDisabled();
      await browserExpect(page.locator("body")).not.toContainText("PRIVATE RAW ERROR");
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await browserExpect(page.locator(".collection-row")).toHaveCount(25);
    } finally {
      await close();
    }
  }, 15000);

  it("renders guide headings and unavailable references without exposing private targets", async () => {
    const guideId = await create("An independent guide", "independent-guide", true);
    const { page, close } = await freshPage();
    try {
      const first = await request(app.getHttpServer())
        .post(`/api/v1/collections/${guideId}/resources/collection`)
        .auth(owner, { type: "bearer" })
        .send({ linkedCollectionId: privateId, position: 0 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/collections/${guideId}/resources/heading`)
        .auth(owner, { type: "bearer" })
        .send({
          title: "Getting started",
          firstItemId: first.body.data.id,
          firstItemVersion: first.body.data.version,
        })
        .expect(201);
      await ready(page, `/c/${guideId}`);
      await browserExpect(
        page.getByRole("heading", { name: "Getting started", exact: true }),
      ).toBeVisible();
      await browserExpect(
        page.getByRole("heading", { name: "Collection unavailable", exact: true }),
      ).toBeVisible();
      await browserExpect(page.locator("main")).not.toContainText("Private title");
      await browserExpect(page.locator(`main a[href="/c/${privateId}"]`)).toHaveCount(0);
      const [name, ...value] = cookie.split("=");
      await page.context().addCookies([{ name, value: value.join("="), url: origin }]);
      await ready(page, `/c/${guideId}`);
      await browserExpect(
        page.getByRole("link", { name: "Private title should never leak", exact: true }),
      ).toHaveAttribute("href", `/c/${privateId}`);
    } finally {
      await request(app.getHttpServer())
        .delete(`/api/v1/collections/${guideId}`)
        .auth(owner, { type: "bearer" })
        .expect(200);
      await close();
    }
  });

  it("explains unavailable collections and returns signed-out readers after sign-in", async () => {
    for (const js of [true, false]) {
      const { page, close } = await freshPage(js);
      try {
        await page.setViewportSize({ width: 390, height: 844 });
        for (const path of [`/c/${privateId}?s=expired-token`, `/@${handle}/private-reading`]) {
          await ready(page, path);
          const feedback = page.locator("main .feedback");
          await browserExpect(feedback).toContainText("It may be private or no longer exist.");
          await browserExpect(feedback).not.toContainText("Private title");
          await browserExpect(
            feedback.getByRole("link", { name: "Sign in", exact: true }),
          ).toHaveAttribute("href", `/sign-in?${new URLSearchParams({ returnTo: path })}`);
          if (js && path.startsWith("/c/"))
            await page.screenshot({
              path: "/tmp/unavailable-collection-signed-out.png",
              fullPage: true,
            });
          await feedback.getByRole("link", { name: "Sign in", exact: true }).click();
          await browserExpect(page.locator('input[name="returnTo"]')).toHaveValue(path);
        }
        const [name, ...value] = otherCookie.split("=");
        await page.context().addCookies([{ name, value: value.join("="), url: origin }]);
        await ready(page, `/c/${privateId}`);
        await browserExpect(page.locator("main .feedback")).toContainText(
          "It may be private or no longer exist.",
        );
        await browserExpect(
          page.locator("main").getByRole("link", { name: "Sign in", exact: true }),
        ).toHaveCount(0);
        await browserExpect(
          page.getByRole("link", { name: "Discover collections", exact: true }),
        ).toBeVisible();
        if (js)
          await page.screenshot({ path: "/tmp/unavailable-collection-mobile.png", fullPage: true });
      } finally {
        await close();
      }
    }
  }, 25000);

  it("keeps hidden/missing/malformed collections equivalent and clears history after unpublish", async () => {
    const { page, close } = await freshPage();
    try {
      for (const id of [privateId, crypto.randomUUID(), "invalid"]) {
        await ready(page, `/c/${id}`);
        await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
        await browserExpect(page.locator("body")).not.toContainText("Private title");
      }
      await ready(page, `/c/${sourceId}`);
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Discover", exact: true })
        .click();
      await change(sourceId, "unpublish");
      await page.goBack();
      await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
    } finally {
      await change(sourceId, "publish");
      await close();
    }
  }, 20000);

  it("keeps reference navigation independent of the source share token", async () => {
    await change(sourceId, "unpublish");
    const { page, close } = await freshPage();
    try {
      await ready(page, `/c/${sourceId}?s=${linkToken}`);
      await browserExpect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name: "Discover", exact: true }),
      ).toHaveAttribute("href", "/discover");
      expect(
        await page
          .getByRole("link", { name: "Open the reference", exact: true })
          .getAttribute("href"),
      ).not.toContain(linkToken);
      await browserExpect(
        page.locator(".sheet-body").getByText("reference-tag", { exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "A useful collection", exact: true }).click();
      expect(new URL(page.url()).searchParams.get("s")).toBeNull();
      await browserExpect(page.locator("h1")).toHaveText("A useful collection");
      await request(app.getHttpServer())
        .put(`/api/v1/collections/${sourceId}/link-sharing`)
        .auth(owner, { type: "bearer" })
        .send({ enabled: true, rotate: true })
        .expect(200);
      await page.reload();
      await browserExpect(page.locator("h1")).toHaveText("A useful collection");
      await ready(page, `/c/${sourceId}?s=${linkToken}`);
      await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
      expect(
        await page.evaluate(
          () => Object.keys(localStorage).length + Object.keys(sessionStorage).length,
        ),
      ).toBe(0);
    } finally {
      await change(sourceId, "publish");
      await close();
    }
  }, 15000);

  it("issues a real browser cookie and prevents cross-user/expired-session restoration", async () => {
    const { page, close } = await freshPage();
    try {
      await ready(page);
      const email = "reader-owner@example.com";
      expect(
        await page.evaluate(
          async (value) =>
            (
              await fetch("/api/v1/auth/code/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: value }),
              })
            ).status,
          email,
        ),
      ).toBe(200);
      const row = await prisma.emailOutbox.findFirstOrThrow({
        where: {
          recipientKey: emailKey(emailConfig().suppressionSecret, "recipient", email),
          state: "pending",
        },
        orderBy: { createdAt: "desc" },
      });
      const code = unseal(row.payload ?? "", process.env.BETTER_AUTH_SECRET ?? "").text.match(
        /\b\d{8}\b/,
      )?.[0];
      expect(
        await page.evaluate(
          async (body) =>
            (
              await fetch("/api/v1/auth/code/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              })
            ).status,
          { email, code },
        ),
      ).toBe(200);
      await ready(page, `/c/${privateId}`);
      await browserExpect(page.locator("h1")).toHaveText("Private title should never leak");
      const other = await freshPage();
      try {
        await ready(other.page, `/c/${privateId}`);
        await browserExpect(other.page.locator("h1")).toHaveText(
          "This collection isn't available.",
        );
      } finally {
        await other.close();
      }
      await ready(page, `/@${handle}/private-reading`);
      await browserExpect(page.locator("h1")).toHaveText("Private title should never leak");
      await prisma.session.updateMany({ data: { expiresAt: new Date(0) } });
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Discover", exact: true })
        .click();
      await page.goBack();
      await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
      await ready(page, `/c/${privateId}`);
      await browserExpect(page.locator("h1")).toHaveText("This collection isn't available.");
    } finally {
      await close();
    }
  }, 20000);

  it("shows complete empty and unavailable states without leaking remote errors", async () => {
    const { page, close } = await freshPage();
    try {
      discoverMode = "empty";
      await ready(page);
      await browserExpect(page.getByText("No published collections yet.")).toBeVisible();
      discoverMode = "failure";
      await page.reload();
      await browserExpect(page.locator("h1")).toHaveText("We couldn't load this page.");
      await browserExpect(page.locator("body")).not.toContainText("PRIVATE INTERNAL DETAIL");
      discoverMode = "normal";
      await page.getByRole("button", { name: "Try again", exact: true }).click();
      await browserExpect(page.locator(".collection-row")).toHaveCount(20);
    } finally {
      discoverMode = "normal";
      await close();
    }
  }, 15000);

  it("rejects unsafe cookie requests independent of body type, origin absence and bearer headers", async () => {
    const signed = await signInHubOwner(app.getHttpServer(), { email: "csrf-reader@example.com" });
    const token = signed.headers["set-auth-token"];
    const session = (signed.headers["set-cookie"] as unknown as string[])
      .map((value) => value.split(";")[0])
      .join("; ");
    for (const sentOrigin of [undefined, "null", "https://untrusted.example"]) {
      for (const type of ["application/json", "multipart/form-data; boundary=fixture"]) {
        const req = request(app.getHttpServer())
          .post("/api/v1/imports")
          .set("Cookie", session)
          .set("Content-Type", type)
          .auth(token, { type: "bearer" });
        if (sentOrigin) req.set("Origin", sentOrigin);
        await req.send(type === "application/json" ? "{}" : "--fixture--").expect(403);
      }
      const req = request(app.getHttpServer())
        .post(`/api/v1/collections/${privateId}/unpublish`)
        .set("Cookie", session);
      if (sentOrigin) req.set("Origin", sentOrigin);
      await req.expect(403);
    }
    // Trusted cookie and cookie-free bearer reach the API authority, not middleware rejection.
    await request(app.getHttpServer())
      .get("/api/v1/profile")
      .auth(token, { type: "bearer" })
      .expect(200);
    await request(app.getHttpServer())
      .patch("/api/v1/profile")
      .set("Cookie", session)
      .set("Origin", origin)
      .send({ hubDescription: "Browser boundary verified" })
      .expect(200);
  }, 15000);
});

async function capturedCode(email: string, expectedSubject?: string) {
  const row = await prisma.emailOutbox.findFirstOrThrow({
    where: {
      recipientKey: emailKey(emailConfig().suppressionSecret, "recipient", email),
      state: "pending",
    },
    orderBy: { createdAt: "desc" },
  });
  const payload = unseal(
    row.payload ?? "",
    process.env.BETTER_AUTH_SECRET ?? "dev-better-auth-secret",
  );
  if (expectedSubject) expect(payload.subject).toBe(expectedSubject);
  const code = payload.text.match(/^\d{8}$/m)?.[0];
  if (!code) throw new Error("Missing captured browser code");
  return code;
}
async function settingsSection(page: Page, name: "Profile" | "Hub" | "Notifications") {
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("link", { name, exact: true })
    .click();
}
async function browserOwnerSettings(page: Page, email: string) {
  await browserSignIn(page, email, "/settings");
  const person = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.withAuthority(() => ensurePersonalHub(prisma, person.id));
  await ready(page, "/settings");
}

async function browserSignIn(page: Page, email: string, returnTo = "/manage") {
  await ready(page, `/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email address").fill(email);
  const sent = page.waitForResponse((response) => response.url().endsWith("/forms/code-send"));
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  const response = await sent;
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBeDefined();
  expect(new URL(response.headers().location, origin).origin).toBe(origin);
  await browserExpect(page.locator("h1")).toHaveText("Check your email");
  expect(page.url()).not.toContain(email);
  await page.getByLabel("Eight-digit code").fill(await capturedCode(email));
  await page.getByRole("button", { name: "Verify and continue" }).click();
}
async function operatorFixture(name: string) {
  const email = `${name}-${crypto.randomUUID()}@example.com`;
  const signed = await signInHubOwner(app.getHttpServer(), { email, name });
  const { changeOperatorGrant } = await import("../fixtures/operator.js");
  await changeOperatorGrant(prisma, {
    userId: signed.body.user.id,
    grant: true,
    authority: "browser-fixture",
    version: 1,
  });
  return { email, id: signed.body.user.id, token: signed.headers["set-auth-token"] as string };
}
async function chooseAction(page: Page, action: string, scope = page.locator("body")) {
  const direct = scope.locator(`.account-actions a[href*="action=${action}"]`);
  if (await direct.count()) {
    await direct.click();
    return;
  }
  const labels: Record<string, string> = {
    hold: "Hold distribution",
    release: "Release hold",
    share: "Share",
    publish: "Publish",
    unpublish: "Unpublish",
    delete: "Delete",
  };
  const trigger = scope.locator(".action-trigger:visible").first();
  if (await trigger.count()) {
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await browserExpect(dialog).toBeVisible();
    await dialog.getByRole("link", { name: labels[action], exact: true }).click();
  } else {
    const picker = scope.locator("details.action-menu").first();
    await picker.locator("summary").click();
    await picker.getByRole("link", { name: labels[action], exact: true }).click();
  }
}
async function submitOperation(page: Page, name: string, reason: string) {
  const actions: Record<string, string> = {
    "Suspend account": "account.suspend",
    "Reactivate account": "account.reactivate",
    "End all sessions": "sessions.revoke",
    "Schedule account deletion": "account.delete",
    "Cancel account deletion": "account.cancel_deletion",
  };
  if (actions[name] && !(await page.getByRole("heading", { name, exact: true }).count()))
    await chooseAction(page, actions[name]);
  const section = page
    .locator(".operation-section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await section.getByLabel("Reason", { exact: true }).selectOption(reason);
  await section.getByRole("button", { name, exact: true }).click();
}

it("appends filtered audit events, retains rows on retry and hides Load more at the end", async () => {
  const op = await operatorFixture("audit-pagination");
  await prisma.auditLog.createMany({
    data: Array.from({ length: 45 }, (_, i) => ({
      category: "operation",
      actorKind: "user",
      actorUserId: op.id,
      targetUserId: op.id,
      action: "account.suspend",
      outcome: "success",
      createdAt: new Date(Date.now() - i * 60000),
    })),
  });
  for (const js of [true, false]) {
    const { page, close } = await freshPage(js);
    try {
      const denied = await page.request.get(`${origin}/manage/audit/more?action=account.suspend`);
      expect(denied.status()).toBe(401);
      await browserSignIn(page, op.email, "/manage/audit");
      await page.getByRole("searchbox", { name: "Search", exact: true }).fill(op.id);
      await page.getByLabel("Action", { exact: true }).selectOption("account.suspend");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      const rows = page.locator(".ops-table tbody tr");
      await browserExpect(rows).toHaveCount(20);
      expect(page.url()).not.toContain(op.email);
      // Local-time hydration may change the visible timestamp; event instants
      // and the other cells must survive pagination/retry unchanged.
      const snapshots = () =>
        rows.evaluateAll((entries) =>
          entries.map((row) =>
            [
              row.querySelector("time")?.getAttribute("datetime"),
              ...Array.from(row.querySelectorAll("td"))
                .slice(1)
                .map((cell) => cell.textContent),
            ].join("|"),
          ),
        );
      const first = await snapshots();
      const load = page.getByRole("link", { name: "Load more", exact: true });
      const href = await load.getAttribute("href");
      expect(href).toContain("action=account.suspend");
      expect(href).toContain(`q=${op.id}`);
      const panel = page.getByRole("region", { name: "Audit events", exact: true });
      const top = await page
        .locator(".ops-filters")
        .evaluate((el) => el.getBoundingClientRect().top);
      await panel.focus();
      await panel.press("End");
      await browserExpect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(
        await page.locator(".ops-filters").evaluate((el) => el.getBoundingClientRect().top),
      ).toBe(top);
      await browserExpect(
        page.getByRole("columnheader", { name: "Timestamp", exact: true }),
      ).toBeInViewport();
      const gap = await load.evaluate((el) => {
        const table = document.querySelector(".ops-table");
        if (!table) throw new Error("Missing audit table");
        return el.getBoundingClientRect().top - table.getBoundingClientRect().bottom;
      });
      expect(gap).toBeGreaterThanOrEqual(24);
      if (js) {
        const address = page.url();
        await page.route(
          "**/manage/audit/more?**",
          (route) =>
            route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "unavailable" } }),
            }),
          { times: 1 },
        );
        await load.click();
        await browserExpect(
          page.getByText("Couldn't load more. Your current events are still here."),
        ).toBeVisible();
        expect(await snapshots()).toEqual(first);
        await page.getByRole("button", { name: "Try again", exact: true }).click();
        await browserExpect(rows).toHaveCount(40);
        expect((await snapshots()).slice(0, 20)).toEqual(first);
        expect(page.url()).toBe(address);
        await load.click();
        await browserExpect(rows).toHaveCount(45);
        await browserExpect(load).toHaveCount(0);
        await browserExpect(
          page.getByRole("status").filter({ hasText: "All events loaded." }),
        ).toBeAttached();
        await panel.focus();
        await panel.press("End");
        await page.screenshot({ path: "/tmp/audit-load-more-desktop.png" });
      } else {
        await load.focus();
        await load.press("Enter");
        await browserExpect(page).toHaveURL(/cursor=/);
        await browserExpect(rows).toHaveCount(20);
        expect((await snapshots())[0]).not.toBe(first[0]);
        expect(page.url()).toContain("cursor=");
        expect(page.url()).toContain(`q=${op.id}`);
      }
    } finally {
      await close();
    }
  }
}, 30000);

describe("management: production browser journey", () => {
  it("signs in and completes account/moderation/audit/recovery with native forms", async () => {
    for (const js of [true, false]) {
      await prisma.requestBudget.deleteMany();
      const op = await operatorFixture(`browser-operator-${js}`);
      const targetEmail = `browser-target-${crypto.randomUUID()}@example.com`;
      const target = await signInHubOwner(app.getHttpServer(), {
        email: targetEmail,
        name: "Browser target",
      });
      const collection = await request(app.getHttpServer())
        .post("/api/v1/collections")
        .auth(target.headers["set-auth-token"], { type: "bearer" })
        .send({
          slug: `browser-${crypto.randomUUID()}`,
          title: "Moderation browser fixture",
          published: true,
        })
        .expect(201);
      const id = collection.body.data.id;
      const { page, close } = await freshPage(js);
      try {
        await browserSignIn(page, op.email);
        await browserExpect(page.locator("h1")).toHaveText("Accounts");
        const tabs = page.getByRole("navigation", { name: "Manage" });
        await browserExpect(tabs.getByRole("link", { name: "Accounts" })).toHaveAttribute(
          "aria-current",
          "page",
        );
        await page
          .getByLabel("User ID, username, email or hub handle", { exact: true })
          .fill(targetEmail);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        // The searched email never appears in the address.
        expect(page.url()).not.toContain(targetEmail);
        const row = page.locator(".ops-table tbody tr");
        await browserExpect(row).toHaveCount(1);
        await browserExpect(row).toContainText("Browser target");
        await row.getByRole("button", { name: "Browser target", exact: true }).click();
        await chooseAction(page, "account.suspend");
        await submitOperation(page, "Suspend account", "spam");
        await browserExpect(
          page.getByText("The action is complete.", { exact: true }),
        ).toBeVisible();
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: target.body.user.id } }))
            .accountState,
        ).toBe("suspended");
        await submitOperation(page, "Reactivate account", "review_completed");
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: target.body.user.id } }))
            .accountState,
        ).toBe("active");
        await signInWithCode(app.getHttpServer(), { email: targetEmail });
        await ready(page, `/manage/accounts/${target.body.user.id}`);
        await submitOperation(page, "End all sessions", "account_compromise");
        await tabs.getByRole("link", { name: "Collections" }).click();
        await page.getByLabel("Collection ID or link", { exact: true }).fill(`${origin}/c/${id}`);
        await page.getByRole("button", { name: "Search", exact: true }).click();
        await browserExpect(page.locator(".ops-table tbody tr")).toHaveCount(1);
        await chooseAction(page, "hold", page.locator(".ops-table tbody tr"));
        await browserExpect(page).toHaveURL(new RegExp(`/manage/collections/${id}`));
        await submitOperation(page, "Hold distribution", "harmful_content");
        await browserExpect(
          page.getByRole("button", { name: "Release hold", exact: true }),
        ).toBeVisible();
        await request(app.getHttpServer()).get(`/api/v1/collections/${id}`).expect(404);
        // Held collections are listed and released from their row.
        await ready(page, "/manage/collections");
        const held = page.locator(".ops-table tbody tr").filter({ hasText: id });
        await chooseAction(page, "release", held);
        await submitOperation(page, "Release hold", "review_completed");
        await browserExpect(
          page.getByText("The action is complete.", { exact: true }),
        ).toBeVisible();
        await ready(page, `/manage/collections/${id}`);
        await page.getByRole("link", { name: "View this collection's operator history" }).click();
        await browserExpect(page.locator("h1")).toHaveText("Audit Log");
        await browserExpect(page.locator(".ops-table")).toContainText(
          "Hold collection publication",
        );
        await page.getByLabel("Action", { exact: true }).selectOption("collection.release");
        await page.getByRole("button", { name: "Apply filters", exact: true }).click();
        await browserExpect(page.locator(".ops-table tbody tr")).toHaveCount(1);
        await browserExpect(page.getByRole("link", { name: "Clear filters" })).toBeVisible();
        for (const width of [320, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
        }
        await page.screenshot({ path: `/tmp/w3-operations-audit-${js}.png`, fullPage: true });
        await page.getByLabel("Account menu", { exact: true }).click();
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await browserExpect(
          page
            .getByRole("navigation", { name: "Main navigation" })
            .getByRole("link", { name: "Sign in", exact: true }),
        ).toBeVisible();
        await ready(page, "/manage");
        await browserExpect(page.locator("h1")).toHaveText("Sign in");
      } finally {
        await close();
      }
    }
  }, 60000);

  it("recovers invalid codes, resends, safe return paths and stale operator authentication", async () => {
    const op = await operatorFixture("browser-recovery"),
      { page, close } = await freshPage();
    try {
      await ready(page, "/sign-in?returnTo=https://untrusted.example/");
      await page.getByLabel("Email address").fill(op.email);
      await page.getByRole("button", { name: "Send code", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Check your email");
      await page.getByLabel("Eight-digit code").fill("00000000");
      await page.getByRole("button", { name: "Verify and continue" }).click();
      await browserExpect(page.locator(".form-notice")).toContainText("incorrect or expired");
      await waitForResend(page);
      await page.getByRole("button", { name: "Send a new code", exact: true }).click();
      await browserExpect(page.locator(".toast")).toContainText("sent a new code");
      await page.getByLabel("Eight-digit code").fill(await capturedCode(op.email));
      await page.getByRole("button", { name: "Verify and continue" }).click();
      await browserExpect(page.locator("h1")).toHaveText("Good links deservea place to belong.");
      expect(new URL(page.url()).origin).toBe(origin);
      // A sensitive action with a stale verification asks the signed-in
      // operator to confirm it's them, then finishes the action by itself.
      const member = await signInHubOwner(app.getHttpServer(), {
        email: `stale-target-${crypto.randomUUID()}@example.com`,
        name: "Stale target",
      });
      const memberId = member.body.user.id;
      await ready(page, `/manage/accounts/${memberId}`);
      await prisma.session.updateMany({
        where: { userId: op.id },
        data: { verifiedAt: new Date(0) },
      });
      await submitOperation(page, "End all sessions", "owner_request");
      await browserExpect(page.locator("h1")).toHaveText("Confirm it's you");
      await browserExpect(page.locator("main")).toContainText("sign this account out everywhere");
      await browserExpect(page.getByLabel("Email address")).toHaveCount(0);
      await page.screenshot({ path: "/tmp/verify-confirm.png" });
      // Cancel sends nothing and returns to where the action was started.
      const mailsBefore = await prisma.emailOutbox.count();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Stale target");
      expect(await prisma.emailOutbox.count()).toBe(mailsBefore);
      await submitOperation(page, "End all sessions", "owner_request");
      await browserExpect(page.locator("h1")).toHaveText("Confirm it's you");
      await page.getByRole("button", { name: "Send code", exact: true }).click();
      // Having chosen to send it, the code screen offers a new code, not a cancel.
      await browserExpect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
      await browserExpect(page.locator(".resend-row")).toContainText("Didn't receive the code?");
      await page.screenshot({ path: "/tmp/verify-code.png" });
      await browserExpect(page.locator("h1")).toHaveText("Confirm it's you");
      // A pasted code with a space ("3368 6575") is accepted.
      const confirmCode = await capturedCode(op.email, "Confirm it's you · nslinkhub");
      await page
        .getByLabel("Eight-digit code")
        .fill(`${confirmCode.slice(0, 4)} ${confirmCode.slice(4)}`);
      await page.getByRole("button", { name: "Confirm and continue" }).click();
      await browserExpect(page.locator("h1")).toHaveText("Stale target");
      await browserExpect(page.getByText("The action is complete.", { exact: true })).toBeVisible();
      expect(
        await prisma.session.count({ where: { userId: memberId, expiresAt: { gt: new Date() } } }),
      ).toBe(0);
      await ready(page, `/manage/accounts/${op.id}`);
      await browserExpect(page.locator("h1")).toHaveText("browser-recovery");
      await prisma.operatorGrant.delete({ where: { userId: op.id } });
      await page.reload();
      await browserExpect(page.getByRole("navigation", { name: "Main navigation" })).toContainText(
        "Manage",
      );
      await browserExpect(page.locator("main")).not.toContainText(op.email);
    } finally {
      await close();
    }
  }, 30000);
});

it("keeps native form budgets source-bound and rejects forged form origins", async () => {
  const secret = process.env.BETTER_AUTH_SECRET ?? "dev-better-auth-secret";
  await prisma.requestBudget.create({
    data: {
      key: requestBudgetKey("auth", "127.0.0.2", secret),
      count: 30,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  async function send(
    source: string,
    claimedOrigin = origin,
    profile?: {
      cookie: string;
      displayName: string;
      username: string;
      hubName: string;
      handle: string;
    },
  ) {
    const child = Bun.spawn(
      [
        "node",
        "-e",
        `
      const {request}=require('node:http');
      const {url,source,origin,body,cookie}=JSON.parse(process.argv[1]);
      const req=request(url,{method:'POST',localAddress:source,headers:{'Origin':origin,'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body),'x-forwarded-for':'127.0.0.99','x-web-form-source':'forged',...(cookie ? {Cookie:cookie} : {})}},res=>{
        res.resume();res.on('end',()=>process.stdout.write(JSON.stringify({status:res.statusCode,location:res.headers.location})));
      });req.on('error',()=>process.exit(1));req.end(body);
    `,
        JSON.stringify({
          url: `${webOrigin}/forms/${profile ? "profile-save" : "code-send"}`,
          cookie: profile?.cookie,
          source,
          origin: claimedOrigin,
          body: new URLSearchParams(
            profile
              ? {
                  displayName: profile.displayName,
                  username: profile.username,
                  handle: profile.handle,
                  hubName: profile.hubName,
                  hubDescription: "Source-bound profile",
                }
              : {
                  email: `source-${crypto.randomUUID()}@example.com`,
                },
          ).toString(),
        }),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const body = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    return JSON.parse(body);
  }
  const blocked = await send("127.0.0.2");
  expect(blocked.status).toBe(303);
  expect(blocked.location).toContain("notice=limited");
  const allowed = await send("127.0.0.3");
  expect(allowed.status).toBe(303);
  expect(allowed.location).toContain("notice=sent");
  expect((await send("127.0.0.3", "https://untrusted.example")).status).toBe(403);
  const signed = await signInHubOwner(app.getHttpServer(), {
    email: `profile-source-${crypto.randomUUID()}@example.com`,
    name: "Before",
  });
  const hub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: signed.body.user.id } });
  const profile = {
    cookie: (signed.headers["set-cookie"] as unknown as string[])
      .map((c) => c.split(";")[0])
      .join("; "),
    displayName: "After",
    username: (await prisma.user.findUniqueOrThrow({ where: { id: signed.body.user.id } }))
      .username,
    handle: hub.handle,
    hubName: hub.name,
  };
  await prisma.requestBudget.create({
    data: {
      key: requestBudgetKey("write", "127.0.0.2", secret),
      count: 60,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  expect((await send("127.0.0.2", origin, profile)).location).toContain("notice=limited");
  expect((await send("127.0.0.3", origin, profile)).location).toContain("notice=profile-saved");
  expect((await prisma.user.findUniqueOrThrow({ where: { id: signed.body.user.id } })).name).toBe(
    "After",
  );
  expect((await send("127.0.0.3", "https://untrusted.example", profile)).status).toBe(403);
}, 15000);

describe("email invitation onboarding", () => {
  async function emailedLink(email: string) {
    const invite = await prisma.serviceInvitation.findFirstOrThrow({
      where: { email, state: "pending" },
    });
    const mail = await prisma.emailOutbox.findUniqueOrThrow({
      where: { id: invite.deliveryId as string },
    });
    const text = unseal(mail.payload as string, emailConfig().secret).text;
    const token = text.match(/#token=([A-Za-z0-9_-]{43})/)?.[1];
    if (!token) throw new Error("Missing captured invitation token");
    return `${origin}/invitations/accept#token=${token}`;
  }
  async function openEmail(page: Page, email: string, js: boolean) {
    const url = await emailedLink(email);
    const leaked: string[] = [];
    const track = (req: { url(): string }) => {
      if (req.url().includes("token=")) leaked.push(req.url());
    };
    page.on("request", track);
    await page.goto(url);
    if (!js) {
      await page.getByLabel("Invitation link", { exact: true }).fill(url);
      await page.getByRole("button", { name: "Review invitation", exact: true }).click();
    }
    await browserExpect(page.locator("h1")).toHaveText(
      /Become the service admin|Become a service operator/,
    );
    page.off("request", track);
    expect(leaked).toEqual([]);
    expect(page.url()).not.toContain("token=");
  }
  async function consent(page: Page) {
    await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  }
  async function verifyInvitationCode(page: Page, email: string) {
    await browserExpect(page.locator("h1")).toHaveText("Check your email");
    await page.getByLabel("Eight-digit code").fill(await capturedCode(email));
    await page.getByRole("button", { name: "Verify and activate" }).click();
    await browserExpect(page.locator("h1")).toHaveText("Accounts");
  }
  it("starts from email, creates accounts only on acceptance, and requires fresh OTP for matching sessions with or without JavaScript", async () => {
    const { prepareAdminInvitation } = await import("../../src/operations/invitations.js");
    for (const js of [true, false]) {
      await prisma.requestBudget.deleteMany();
      const adminEmail = `mail-admin-${crypto.randomUUID()}@example.com`;
      const operatorEmail = `mail-operator-${crypto.randomUUID()}@example.com`;
      await prepareAdminInvitation(prisma, adminEmail, !js, "browser-recovery");
      const adminBrowser = await freshPage(js),
        recipient = await freshPage(js);
      const page = adminBrowser.page;
      try {
        expect(await prisma.user.findUnique({ where: { email: adminEmail } })).toBeNull();
        await openEmail(page, adminEmail, js);
        expect(await prisma.user.findUnique({ where: { email: adminEmail } })).toBeNull();
        await page.getByLabel("Your name", { exact: true }).fill("Browser admin");
        for (const width of [320, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
        }
        await page.screenshot({ path: `/tmp/w3-email-invitation-${js}.png`, fullPage: true });
        await consent(page);
        await browserExpect(page.locator("h1")).toHaveText("Check your email");
        const account = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
        expect(account.name).toBe("Browser admin");
        expect(account.emailVerified).toBe(false);
        expect(await prisma.session.count({ where: { userId: account.id } })).toBe(0);
        await verifyInvitationCode(page, adminEmail);
        await page.getByRole("link", { name: "Team", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Team");
        await browserExpect(page.getByLabel("Operator's email")).toHaveCount(0);
        await browserExpect(page.locator(".ops-table")).toContainText(adminEmail);
        if (js) await page.screenshot({ path: "/tmp/manage-team-desktop.png" });
        await page.getByRole("link", { name: "Invitations", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Invitations");
        for (const width of [320, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
        if (js) await page.screenshot({ path: "/tmp/manage-invitations-desktop.png" });
        await page.getByLabel("Operator's email").fill(operatorEmail);
        await page.getByRole("button", { name: "Invite operator" }).click();
        await browserExpect(page.locator(".toast")).toContainText("complete");
        expect(await prisma.user.findUnique({ where: { email: operatorEmail } })).toBeNull();
        // An authenticated account sees a mismatch instead of changing identity.
        await openEmail(page, operatorEmail, js);
        await browserExpect(
          page.getByRole("button", { name: "Sign out and continue" }),
        ).toBeVisible();
        await browserExpect(
          page.getByRole("button", { name: "Accept invitation", exact: true }),
        ).toHaveCount(0);
        await openEmail(recipient.page, operatorEmail, js);
        await recipient.page.getByLabel("Your name", { exact: true }).fill("Invited operator");
        await consent(recipient.page);
        await verifyInvitationCode(recipient.page, operatorEmail);
        await browserExpect(
          recipient.page.getByRole("link", { name: "Team", exact: true }),
        ).toHaveCount(0);
        await browserExpect(
          recipient.page.getByRole("link", { name: "Invitations", exact: true }),
        ).toHaveCount(0);
        const target = await prisma.user.findUniqueOrThrow({ where: { email: operatorEmail } });
        await ready(page, `/manage/accounts/${target.id}`);
        await page.getByRole("button", { name: "Remove operator access", exact: true }).click();
        await browserExpect(page.locator(".toast")).toContainText("complete");
        // Reinvite the same now-existing account. Its matching session accepts
        // with fresh email proof; its existing name is retained.
        await ready(page, "/manage/invitations");
        await page.getByLabel("Operator's email").fill(operatorEmail);
        await page.getByRole("button", { name: "Invite operator" }).click();
        await browserExpect(page.locator(".toast")).toContainText("complete");
        await openEmail(recipient.page, operatorEmail, js);
        await browserExpect(recipient.page.getByLabel("Your name", { exact: true })).toHaveCount(0);
        await prisma.session.updateMany({
          where: { userId: target.id },
          data: { verifiedAt: new Date(0) },
        });
        const mails = await prisma.emailOutbox.count();
        await consent(recipient.page);
        await browserExpect(recipient.page.locator("h1")).toHaveText("Check your email");
        expect(await prisma.emailOutbox.count()).toBe(mails + 1);
        expect(await prisma.operatorGrant.findUnique({ where: { userId: target.id } })).toBeNull();
        await verifyInvitationCode(recipient.page, operatorEmail);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).name).toBe(
          "Invited operator",
        );
      } finally {
        await adminBrowser.close();
        await recipient.close();
        await prisma.adminGrant.deleteMany();
      }
    }
  }, 90000);
});

describe("account shell and appearance", () => {
  it("retains failed and newer profile edits and ignores stale handle checks", async () => {
    await prisma.requestBudget.deleteMany();
    const email = `profile-retry-${crypto.randomUUID()}@example.com`;
    const { page, close } = await freshPage();
    let release = () => {};
    let releaseCheck = () => {};
    try {
      await browserOwnerSettings(page, email);
      const name = page.getByLabel("Full name", { exact: true });
      await browserExpect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toHaveCount(0);
      await page.route("**/forms/profile-save", (route) => route.abort());
      await name.fill("Draft retained");
      await browserExpect(page.locator(".form-notice.error")).toContainText("edits are still here");
      await browserExpect(name).toHaveValue("Draft retained");
      await settingsSection(page, "Notifications");
      await browserExpect(
        page.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();
      await page.goBack();
      await browserExpect(name).toBeVisible();
      await browserExpect(name).toHaveValue("Draft retained");
      await browserExpect(page.locator(".navigation-loading")).toBeHidden();
      await page.unroute("**/forms/profile-save");
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");

      let started = () => {};
      const waiting = new Promise<void>((resolve) => {
        started = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/forms/profile-save", async (route) => {
        started();
        await held;
        await route.continue();
      });
      await name.fill("Earlier draft");
      await waiting;
      await name.fill("Newer draft");
      release();
      await browserExpect(page.locator(".profile-save-status")).toContainText(
        "Newer changes aren't saved yet.",
      );
      await browserExpect(name).toHaveValue("Newer draft");
      await page.unroute("**/forms/profile-save");
      await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).name).toBe("Newer draft");
      await page.getByLabel("Account menu", { exact: true }).click();
      await browserExpect(page.locator(".account-menu-identity")).toContainText("Newer draft");
      await page.getByLabel("Account menu", { exact: true }).click();

      let checking = () => {};
      const checkStarted = new Promise<void>((resolve) => {
        checking = resolve;
      });
      const heldCheck = new Promise<void>((resolve) => {
        releaseCheck = resolve;
      });
      const oldHandle = `old-check-${crypto.randomUUID().slice(0, 8)}`;
      await page.route(
        `**/api/v1/profile/handle-availability?handle=${oldHandle}`,
        async (route) => {
          checking();
          await heldCheck;
          await route.fulfill({ json: { data: { handle: oldHandle, status: "available" } } });
        },
      );
      await settingsSection(page, "Hub");
      const handle = page.getByLabel("Handle", { exact: true });
      await handle.fill(oldHandle);
      await checkStarted;
      await handle.fill("api");
      await browserExpect(page.locator("#handle-status")).toContainText("reserved");
      releaseCheck();
      await browserExpect(page.locator("#handle-status")).toContainText("reserved");
      await handle.fill("ab");
      await browserExpect(page.locator("#handle-status")).toContainText("3–60");
      await page.screenshot({ path: "/tmp/profile-validation.png", fullPage: true });
    } finally {
      release();
      releaseCheck();
      await close();
    }
  }, 30000);

  it("renders public profile and hub connections with and without JavaScript", async () => {
    for (const js of [true, false]) {
      await prisma.requestBudget.deleteMany();
      const email = `attribution-browser-${crypto.randomUUID()}@example.com`;
      const { page, close } = await freshPage(js);
      try {
        await browserOwnerSettings(page, email);
        const user = await prisma.user.findUniqueOrThrow({
          where: { email },
          include: { hub: true },
        });
        if (!user.hub) throw new Error("Expected hub");
        const hub = user.hub;
        const toggle = page.getByRole("switch", {
          name: "Show owner",
          exact: true,
        });
        await page.getByLabel("Full name", { exact: true }).fill("Named Owner");
        if (!js) await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await settingsSection(page, "Hub");
        await browserExpect(toggle).toBeChecked();
        await page.getByLabel("Hub name", { exact: true }).fill("Independent Hub");
        await toggle.uncheck();
        if (js)
          await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
        else await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await ready(page, "/settings?section=hub");
        await browserExpect(toggle).not.toBeChecked();
        await browserExpect(page.locator("#display-name")).toHaveValue("Named Owner");
        expect((await prisma.hub.findUniqueOrThrow({ where: { id: hub.id } })).showOwner).toBe(
          false,
        );
        for (const path of [`/h/${hub.id}`, `/@${hub.handle}`, `/h/${hub.id}?view=public`]) {
          await ready(page, path);
          await browserExpect(page.locator("h1")).toHaveText("Independent Hub");
          await browserExpect(page.locator(".hub-identity")).not.toContainText("Named Owner");
        }
        await ready(page, `/${user.username}`);
        await browserExpect(page.locator("h1")).toHaveText("Named Owner");
        await browserExpect(page.locator(".hub-identity")).toHaveText(user.username);
        await browserExpect(
          page.getByRole("button", { name: "Create hub", exact: true }),
        ).toHaveCount(0);
        await ready(page, "/settings?section=hub");
        await toggle.check();
        if (js)
          await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
        else await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await ready(page, "/settings?section=hub");
        await browserExpect(toggle).toBeChecked();
        if (js) {
          await page.screenshot({ path: "/tmp/attribution-settings-desktop.png", fullPage: true });
          await page.emulateMedia({ colorScheme: "dark" });
          await page.screenshot({ path: "/tmp/attribution-settings-dark.png", fullPage: true });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: "/tmp/attribution-settings-mobile.png", fullPage: true });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
        await ready(page, `/h/${hub.id}?view=public`);
        await browserExpect(page.locator(".hub-identity")).toHaveText(
          `@${hub.handle} by Named Owner`,
        );
        await browserExpect(page.locator(".hub-identity a")).toHaveAttribute(
          "href",
          `/${user.username}`,
        );
        await ready(page, `/${user.username}`);
        await browserExpect(page.locator(".hub-identity")).toHaveText(
          `${user.username} of Independent Hub`,
        );
        await browserExpect(page.locator(".hub-identity a")).toHaveAttribute(
          "href",
          `/h/${hub.id}`,
        );
      } finally {
        await close();
      }
    }
  }, 60000);

  it("autosaves an independent hub name before opening its stable public link", async () => {
    await prisma.requestBudget.deleteMany();
    const email = `hub-autosave-${crypto.randomUUID()}@example.com`;
    const { page, close } = await freshPage();
    try {
      await browserOwnerSettings(page, email);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { hub: true },
      });
      const hub = user.hub;
      if (!hub) throw new Error("Expected personal hub");
      await browserExpect(page.getByRole("group", { name: "Profile", exact: true })).toContainText(
        email,
      );
      await browserExpect(page.getByRole("group", { name: "Profile", exact: true })).toContainText(
        "Member since",
      );
      await browserExpect(page.getByRole("heading", { name: "Sign-in", exact: true })).toHaveCount(
        0,
      );
      await page.getByLabel("Full name", { exact: true }).fill("Private Account Owner");
      await settingsSection(page, "Hub");
      await page.getByLabel("Hub name", { exact: true }).fill("The Reference Shelf");
      await page.getByLabel("Description", { exact: true }).fill("Resources for curious readers.");
      await browserExpect(page.getByLabel("About you", { exact: true })).toHaveCount(0);
      await page.getByRole("link", { name: "View your public hub", exact: true }).click();
      await browserExpect(page).toHaveURL(`${origin}/h/${hub.id}?view=public`);
      await browserExpect(page.locator("h1")).toHaveText("The Reference Shelf");
      await browserExpect(page.locator(".page-heading .description")).toHaveText(
        "Resources for curious readers.",
      );
      await browserExpect(page).toHaveTitle("The Reference Shelf · nslinkhub");
      await ready(page, `/@${hub.handle}`);
      await browserExpect(page.locator("h1")).toHaveText("The Reference Shelf");
      await browserExpect(page.locator(".page-heading .description")).toHaveText(
        "Resources for curious readers.",
      );
      await ready(page, "/settings");
      await page.getByLabel("Full name", { exact: true }).fill("Changed Account Owner");
      await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
      expect((await prisma.hub.findUniqueOrThrow({ where: { id: hub.id } })).name).toBe(
        "The Reference Shelf",
      );
      expect((await prisma.hub.findUniqueOrThrow({ where: { id: hub.id } })).description).toBe(
        "Resources for curious readers.",
      );
      await browserExpect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toHaveCount(0);
      await settingsSection(page, "Hub");
      await browserExpect(
        page.getByRole("button", { name: "Copy hub link", exact: true }),
      ).toHaveCount(0);
      await browserExpect(
        page
          .locator("#handle-help")
          .getByRole("link", { name: "View your public hub", exact: true }),
      ).toHaveAttribute("href", `/h/${hub.id}?view=public`);
      await settingsSection(page, "Profile");
      const username = `updated-${crypto.randomUUID().slice(0, 8)}`;
      await page.getByLabel("Username", { exact: true }).fill(username);
      await page
        .locator("#username-help")
        .getByRole("link", { name: "View your public profile", exact: true })
        .click();
      await browserExpect(page).toHaveURL(`${origin}/${username}`);
      await browserExpect(page.locator("h1")).toHaveText("Changed Account Owner");
      await ready(page, "/settings");
      await page.screenshot({ path: "/tmp/profile-quick-link-desktop.png", fullPage: true });
      await settingsSection(page, "Hub");
      await page.screenshot({ path: "/tmp/account-final-desktop.png", fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "/tmp/account-final-mobile.png", fullPage: true });
    } finally {
      await close();
    }
  }, 30000);

  it("serves generated avatars through the same-origin API as valid SVG images", async () => {
    const { page, close } = await freshPage();
    try {
      await ready(page);
      for (const seed of ["user-1", "user-2", "3f1c9a2e-0000-4000-8000-000000000000"]) {
        const response = await page.request.get(`${origin}/api/v1/avatars/${seed}.svg`);
        expect(response.status()).toBe(200);
        const svg = await response.text();
        const parsed = await page.evaluate((xml) => {
          const document = new DOMParser().parseFromString(xml, "image/svg+xml");
          return {
            errors: document.querySelectorAll("parsererror").length,
            tag: document.documentElement.localName,
            namespace: document.documentElement.namespaceURI,
            viewBox: document.documentElement.getAttribute("viewBox"),
            unsafe: document.querySelectorAll("script, foreignObject, image, a").length,
          };
        }, svg);
        expect(parsed).toEqual({
          errors: 0,
          tag: "svg",
          namespace: "http://www.w3.org/2000/svg",
          viewBox: "0 0 40 40",
          unsafe: 0,
        });
        expect(svg).not.toContain(seed);
      }
    } finally {
      await close();
    }
  });

  it("edits the own profile, reviews notifications and uses account navigation in both themes without requiring JavaScript", async () => {
    for (const js of [true, false]) {
      await prisma.requestBudget.deleteMany();
      const email = `profile-${crypto.randomUUID()}@example.com`;
      const { page, close } = await freshPage(js);
      try {
        await browserOwnerSettings(page, email);
        await browserExpect(page.locator("h1")).toHaveText("Settings");
        await browserExpect(page.locator(".wordmark")).toHaveAttribute(
          "href",
          /^\/h\/[a-f0-9-]{36}$/,
        );
        await browserExpect(page).toHaveTitle("Settings · nslinkhub");
        await browserExpect(page).toHaveURL(`${origin}/settings`);
        await browserExpect(
          page
            .locator("header .theme-toggle")
            .getByRole("button", { name: "Appearance: system. Switch to light", exact: true }),
        ).toHaveAttribute("value", "light");
        const wordmarkColor = await page
          .locator(".wordmark")
          .evaluate((el) => getComputedStyle(el).color);
        await page.locator(".wordmark").hover();
        expect(
          await page.locator(".wordmark").evaluate((el) => ({
            color: getComputedStyle(el).color,
            decoration: getComputedStyle(el).textDecorationLine,
          })),
        ).toEqual({ color: wordmarkColor, decoration: "none" });
        const originalAvatar = await page.locator("header .avatar").getAttribute("src");
        await browserExpect
          .poll(() =>
            page
              .locator("header .avatar")
              .evaluate((image) => (image as HTMLImageElement).naturalWidth),
          )
          .toBe(64);
        await page.getByLabel("Full name", { exact: true }).fill("Mina Reader");
        if (!js) await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await settingsSection(page, "Hub");
        const handle = `mina-${crypto.randomUUID().slice(0, 8)}`;
        await page.getByLabel("Handle", { exact: true }).fill(handle);
        if (js) await browserExpect(page.locator("#handle-status")).toHaveText("Available");
        await page
          .getByLabel("Description", { exact: true })
          .fill("A small library of useful references.");
        await page.getByLabel("I choose this permanent hub handle.").check();
        await page.getByRole("button", { name: "Claim handle", exact: true }).click();
        await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
        await browserExpect(page.locator("#handle-status")).toBeHidden();
        await page.screenshot({ path: `/tmp/profile-saved-${js}.png`, fullPage: true });
        if (js) expect(new URL(page.url()).search).toBe("?section=hub");
        const account = await prisma.user.findUniqueOrThrow({
          where: { email },
          include: { hub: true },
        });
        expect(account.name).toBe("Mina Reader");
        expect(account.hub?.description).toBe("A small library of useful references.");
        expect(account.hub?.handle).toBe(handle);
        await page.locator(".wordmark").click();
        await browserExpect(
          page.getByRole("heading", { name: "Your collections", level: 2 }),
        ).toBeVisible();
        await browserExpect(page.locator("h1")).toHaveText(account.hub?.name ?? "Your hub");
        await browserExpect(page.locator(".hub-identity")).toContainText(`@${handle}`);
        await browserExpect(page.locator(".hub-identity")).toContainText("Mina Reader");
        await browserExpect(page.locator(".hub-introduction .description")).toHaveText(
          "A small library of useful references.",
        );
        await browserExpect(
          page.getByRole("link", { name: "View your public hub", exact: true }),
        ).toHaveCount(0);
        if (js) {
          for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            ).toBe(true);
            await page.screenshot({ path: `/tmp/own-hub-${width}.png` });
          }
        }
        await browserExpect(page).toHaveTitle(`${account.hub?.name} · nslinkhub`);
        await browserExpect(page).toHaveURL(`${origin}/h/${account.hub?.id}`);
        await page.getByLabel("Account menu", { exact: true }).click();
        await browserExpect(
          page
            .getByRole("navigation", { name: "Account navigation" })
            .getByRole("link", { name: "Profile", exact: true }),
        ).toHaveAttribute("href", `/${account.username}`);
        await page
          .getByRole("navigation", { name: "Account navigation" })
          .getByRole("link", { name: "Settings", exact: true })
          .click();
        await browserExpect(page.locator("h1")).toHaveText("Settings");
        await browserExpect(
          page.getByRole("navigation", { name: "Settings sections" }),
        ).toBeVisible();
        await settingsSection(page, "Hub");
        await browserExpect(page.locator(".hub-id")).toContainText(
          account.hub?.id ?? "missing hub",
        );
        await browserExpect(
          page
            .locator("fieldset")
            .filter({ has: page.locator("legend", { hasText: /^Profile$/ }) }),
        ).toBeHidden();
        await browserExpect(page.getByRole("group", { name: "Hub", exact: true })).toBeVisible();
        await browserExpect(
          page
            .locator("fieldset")
            .filter({ has: page.locator("legend", { hasText: /^Profile$/ }) }),
        ).toContainText(email);
        expect(originalAvatar).toBe(`/api/v1/users/${account.id}/avatar`);
        await browserExpect(page.locator("header .avatar")).toHaveAttribute(
          "src",
          `/api/v1/users/${account.id}/avatar`,
        );
        await browserExpect(page.locator("summary img")).toHaveAttribute(
          "src",
          `/api/v1/users/${account.id}/avatar`,
        );
        await browserExpect
          .poll(() =>
            page
              .locator("summary img")
              .evaluate((image) => (image as HTMLImageElement).naturalWidth),
          )
          .toBe(64);
        await browserExpect(page.getByLabel("Handle", { exact: true })).toHaveAttribute(
          "readonly",
          "",
        );
        await browserExpect(
          page.getByRole("button", { name: "Claim handle", exact: true }),
        ).toHaveCount(0);
        expect(
          (await prisma.hub.findUniqueOrThrow({ where: { id: account.hub?.id } })).handle,
        ).toBe(handle);
        await page.getByLabel("Account menu", { exact: true }).click();
        await browserExpect(
          page.getByRole("navigation", { name: "Account navigation" }),
        ).toContainText("Manage");
        await page.getByRole("link", { name: "Settings", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Settings");
        await browserExpect(page).toHaveTitle("Settings · nslinkhub");
        await ready(page, "/settings?section=appearance");
        await browserExpect(
          page.getByRole("group", { name: "Profile", exact: true }),
        ).toBeVisible();
        await browserExpect(page.locator("main .theme-picker")).toHaveCount(0);
        const appearance = page.locator("header .theme-toggle");
        await appearance
          .getByRole("button", { name: "Appearance: system. Switch to light", exact: true })
          .click();
        await appearance
          .getByRole("button", { name: "Appearance: light. Switch to dark", exact: true })
          .click();
        await browserExpect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
        ).toBe("dark");
        await page.reload();
        await browserExpect(
          appearance.getByRole("button", {
            name: "Appearance: dark. Switch to system",
            exact: true,
          }),
        ).toBeVisible();
        await page.getByLabel("Account menu", { exact: true }).click();
        for (const width of [320, 768, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          if (width === 320)
            await page.screenshot({ path: `/tmp/account-menu-phone-${js}.png`, fullPage: true });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          const menuBox = await page.locator(".account-menu-panel").boundingBox();
          expect(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= width).toBeTruthy();
        }
        await page.screenshot({ path: `/tmp/account-menu-dark-${js}.png`, fullPage: true });
        if (js) {
          await page.keyboard.press("Escape");
          await browserExpect(page.getByLabel("Account menu", { exact: true })).toBeFocused();
          await browserExpect(page.locator(".account-menu")).not.toHaveAttribute("open", "");
        } else await page.getByLabel("Account menu", { exact: true }).click();
        await ready(page, "/hub");
        const beforeThemeChange = page.url();
        const headerToggle = page.locator("header .theme-toggle");
        await browserExpect(headerToggle.getByRole("button")).toHaveCount(1);
        for (const [current, next] of [
          ["dark", "system"],
          ["system", "light"],
          ["light", "dark"],
          ["dark", "system"],
          ["system", "light"],
        ]) {
          await headerToggle
            .getByRole("button", {
              name: `Appearance: ${current}. Switch to ${next}`,
              exact: true,
            })
            .click();
          await browserExpect(page).toHaveURL(beforeThemeChange);
          await browserExpect(page.locator("html")).toHaveAttribute("data-theme", next);
        }
        await ready(page, "/settings");
        await browserExpect(page.locator("html")).toHaveAttribute("data-theme", "light");
        await page.screenshot({ path: `/tmp/profile-light-${js}.png`, fullPage: true });
        await page.getByLabel("Account menu", { exact: true }).click();
        await page
          .getByRole("navigation", { name: "Account navigation" })
          .getByRole("link", { name: "Notifications", exact: true })
          .click();
        await browserExpect(page.locator("h1")).toHaveText("Notifications");
        await browserExpect(page).toHaveTitle("Notifications · nslinkhub");
        await browserExpect(page.locator("main")).toContainText("You're all caught up");
        const invitation = await prisma.serviceInvitation.create({
          data: {
            role: "operator",
            email,
            inviteeUserId: account.id,
            invitedById: account.id,
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await ready(page, "/settings");
        await page.getByLabel("Account menu", { exact: true }).click();
        await page.getByRole("link", { name: "Notifications, 1 new", exact: true }).click();
        const item = page.locator("details.notification");
        await browserExpect(item.locator("summary")).toContainText(
          "You're invited to be a service operator",
        );
        await browserExpect(page.locator(".notification.unread .notification-new")).toHaveText(
          "New",
        );
        await item.locator("summary").click();
        await browserExpect(item).toContainText("Check your inbox for the invitation email");
        await browserExpect(item.locator("a")).toHaveCount(0);
        if (js) {
          // Opening Notifications resets the badge; the list stays until cleared.
          await browserExpect
            .poll(
              async () =>
                (await prisma.user.findUniqueOrThrow({ where: { id: account.id } }))
                  .notificationsSeenAt,
            )
            .not.toBeNull();
          await page.reload();
          await page.getByLabel("Account menu", { exact: true }).click();
          await browserExpect(
            page
              .getByRole("navigation", { name: "Account navigation" })
              .getByRole("link", { name: "Notifications", exact: true }),
          ).toBeVisible();
          await page.getByLabel("Account menu", { exact: true }).click();
          await browserExpect(page.locator(".notification.unread")).toHaveCount(0);
        }
        await page.getByRole("button", { name: "Clear all", exact: true }).click();
        await browserExpect(page.locator(".toast")).toContainText("Notifications cleared");
        await browserExpect(page.locator("main")).toContainText("You're all caught up");
        const removedInvitation = await page.request.get(`${origin}/invitations/${invitation.id}`);
        expect(removedInvitation.status()).toBe(404);
        await page.getByLabel("Account menu", { exact: true }).click();
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await browserExpect(
          page
            .getByRole("navigation", { name: "Main navigation" })
            .getByRole("link", { name: "Sign in", exact: true }),
        ).toBeVisible();
        await browserExpect(page.locator("html")).toHaveAttribute("data-theme", "system");
        await ready(page, "/settings");
        await browserExpect(page.locator("h1")).toHaveText("Sign in");
      } finally {
        await close();
      }
    }
  }, 60000);
  it("always follows system appearance without a session, even with a saved preference", async () => {
    for (const js of [true, false]) {
      const { page, close } = await freshPage(js);
      try {
        await page.context().addCookies([{ name: "appearance", value: "light", url: origin }]);
        await page.emulateMedia({ colorScheme: "dark" });
        await ready(page);
        await browserExpect(page.locator("html")).toHaveAttribute("data-theme", "system");
        const dark = await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor);
        await page.emulateMedia({ colorScheme: "light" });
        const light = await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(dark).not.toBe(light);
        await browserExpect(page.getByRole("contentinfo").locator(".theme-picker")).toHaveCount(0);
        const denied = await page.request.post(`${origin}/forms/theme`, {
          headers: { Origin: origin },
          form: { theme: "dark", returnTo: "/settings" },
          maxRedirects: 0,
        });
        expect(denied.status()).toBe(303);
        expect(denied.headers().location).toContain("/sign-in");
        expect(denied.headers()["set-cookie"]).toBeUndefined();
        const rejected = await page.request.post(`${origin}/forms/theme`, {
          headers: { Origin: "https://untrusted.example" },
          form: { theme: "light" },
        });
        expect(rejected.status()).toBe(403);
        const invalid = await page.request.post(`${origin}/forms/theme`, {
          headers: { Origin: origin },
          form: { theme: "invalid" },
        });
        expect(invalid.status()).toBe(400);
      } finally {
        await close();
      }
    }
  }, 20000);
});

it("saves a first private link through email, preserves retries, then adds and renames without requiring JavaScript", async () => {
  for (const js of [true, false]) {
    await prisma.requestBudget.deleteMany();
    const email = `first-link-${crypto.randomUUID()}@example.com`,
      url = `https://fixture-links.dev/first-${crypto.randomUUID()}`;
    const { page, close } = await freshPage(js);
    try {
      await ready(page, "/");
      await page.getByRole("link", { name: "Save your first link", exact: true }).click();
      await page.getByLabel("Link URL", { exact: true }).fill(url);
      await page.getByRole("button", { name: "Save link", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Verify your email to save this link");
      expect(page.url()).not.toContain("fixture-links.dev");
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Send code", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Check your email");
      await capturedCode(email, "Verify your email to save your first link · nslinkhub");
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      await page.getByLabel("Eight-digit code").fill("00000000");
      await page.getByRole("button", { name: "Verify and save" }).click();
      await browserExpect(page.locator(".form-notice")).toContainText("incorrect or expired");
      await waitForResend(page);
      await page.getByRole("button", { name: "Send a new code", exact: true }).click();
      await browserExpect(page.locator(".toast")).toContainText("sent a new code");
      await page
        .getByLabel("Eight-digit code")
        .fill(await capturedCode(email, "Verify your email to save your first link · nslinkhub"));
      failCapture = js;
      await page.getByRole("button", { name: "Verify and save" }).click();
      if (js) {
        await browserExpect(page.locator(".form-notice")).toContainText(
          "couldn't confirm the save",
        );
        await browserExpect(page.getByLabel("Link URL", { exact: true })).toHaveValue(url);
        await browserExpect(page.getByLabel("Account menu", { exact: true })).toBeVisible();
        const verified = await prisma.user.findUniqueOrThrow({
          where: { email },
          include: { hub: true },
        });
        expect(verified.hub).toBeNull();
        failCapture = false;
        await page.reload();
        await page.getByRole("button", { name: "Save link", exact: true }).click();
      }
      await browserExpect(page.locator("h1")).toHaveText(/^Saved links, [A-Z][a-z]{2} \d{1,2}$/);
      await browserExpect(page.locator(".toast")).toContainText("Link saved");
      await browserExpect(page.locator(".resource-row h2 a")).toHaveAttribute("href", url);
      const account = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { hub: true },
      });
      if (!account.hub) throw new Error("Missing fixture hub");
      const collections = await prisma.collection.findMany({ where: { hubId: account.hub.id } });
      expect(collections).toHaveLength(1);
      expect(collections[0].published).toBe(false);
      expect(collections[0].linkSharingEnabled).toBe(false);
      const id = collections[0].id;
      await page.locator(".context a").first().click();
      await browserExpect(page).toHaveURL(`${origin}/h/${account.hub.id}`);
      await browserExpect(
        page.getByRole("heading", { name: "Your collections", exact: true }),
      ).toBeVisible();
      await browserExpect(page.getByRole("link", { name: /^Saved links, / })).toBeVisible();
      await ready(page, `/@${account.hub.handle}`);
      await browserExpect(
        page.getByRole("heading", { name: "Your collections", exact: true }),
      ).toBeVisible();
      await ready(page, `/h/${account.hub.id}?view=public`);
      await browserExpect(page.getByRole("link", { name: /^Saved links, / })).toHaveCount(0);
      await ready(page, `/c/${id}`);
      await request(app.getHttpServer()).get(`/api/v1/collections/${id}`).expect(404);
      await browserExpect(page.locator(".context a").first()).toHaveAttribute(
        "href",
        `/h/${account.hub.id}`,
      );
      await browserExpect(page.locator(".row-meta a").first()).toHaveAttribute(
        "href",
        `/h/${account.hub.id}`,
      );
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await browserExpect(page).toHaveURL(`${origin}/c/${id}/edit`);
      await browserExpect(page.locator("h1")).toHaveText("Edit collection");
      await page.getByLabel("Collection name", { exact: true }).fill("A useful little library");
      await page
        .getByLabel("Description", { exact: true })
        .fill("Useful references for everyday projects.");
      await browserExpect(page.getByLabel("Tags", { exact: true })).toHaveCount(0);
      await browserExpect(page.locator(".tag-add")).toHaveCount(0);
      if (js) {
        for (const width of [390, 768, 1280, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({ path: `/tmp/collection-edit-page-${width}.png` });
        }
        await prisma.collection.update({
          where: { id },
          data: { description: "Changed elsewhere", version: { increment: 1 } },
        });
        await page.getByRole("button", { name: "Save changes", exact: true }).click();
        await browserExpect(page.locator(".edit-form").getByRole("alert")).toContainText(
          "changed elsewhere",
        );
        await browserExpect(page.getByLabel("Collection name", { exact: true })).toHaveValue(
          "A useful little library",
        );
        expect((await prisma.collection.findUniqueOrThrow({ where: { id } })).title).toMatch(
          /^Saved links, /,
        );
      }
      // Saving again deliberately applies the draft over the latest version.
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await browserExpect(page).toHaveURL(new RegExp(`/c/${id}(\\?|$)`));
      await browserExpect(page.locator(".toast")).toContainText("Collection saved");
      await browserExpect(page.locator("h1")).toHaveText("A useful little library");
      await browserExpect(page.locator(".page-heading .description")).toHaveText(
        "Useful references for everyday projects.",
      );
      await browserExpect(page.locator(".page-heading > .tags")).toHaveCount(0);
      await page
        .locator(".collection-actions")
        .getByRole("link", { name: "Edit", exact: true })
        .click();
      await page.getByRole("link", { name: "Add a link", exact: true }).click();
      await page.getByLabel("Link URL", { exact: true }).fill("https://fixture-links.dev/second");
      if (js)
        await prisma.session.updateMany({
          where: { userId: account.id },
          data: { expiresAt: new Date(0) },
        });
      await page.getByRole("button", { name: "Save link", exact: true }).click();
      if (js) {
        await browserExpect(page.locator("h1")).toHaveText("Verify your email to save this link");
        await page.getByLabel("Email address").fill(email);
        await page.getByRole("button", { name: "Send code", exact: true }).click();
        await page.getByLabel("Eight-digit code").fill(await capturedCode(email));
        await page.getByRole("button", { name: "Verify and save" }).click();
      }
      await browserExpect(page.locator(".resource-row")).toHaveCount(2);
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.screenshot({ path: `/tmp/first-link-saved-${js}.png`, fullPage: true });
      await page.locator(".wordmark").click();
      await browserExpect(
        page.getByRole("heading", { name: "Your collections", level: 2 }),
      ).toBeVisible();
      await browserExpect(page.locator(".collection-row")).toContainText("A useful little library");
      await browserExpect(page.getByRole("button", { name: "Previous", exact: true })).toHaveCount(
        0,
      );
      await browserExpect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
      if (js) {
        await ready(page, "/capture");
        const draftId = await page.locator('input[name="draftId"]').inputValue();
        const data = {
          draftId,
          url: "https://fixture-links.dev/double-submit",
          destination: "new",
        };
        const sessionCookies = (await page.context().cookies())
          .map(({ name, value }) => `${name}=${value}`)
          .join("; ");
        const responses = await Promise.all(
          [1, 2].map(() =>
            fetch(`${origin}/forms/capture-save`, {
              method: "POST",
              body: new URLSearchParams(data),
              headers: { Origin: origin, Cookie: sessionCookies },
              redirect: "manual",
            }),
          ),
        );
        expect(responses[0].status).toBe(303);
        expect(responses[1].status).toBe(303);
        expect(responses[0].headers.get("location")).toBe(responses[1].headers.get("location"));
        expect(await prisma.collection.count({ where: { hubId: account.hub.id } })).toBe(2);
        await page.getByLabel("Account menu", { exact: true }).click();
        await page.getByRole("button", { name: "Sign out", exact: true }).click();
        await ready(page, "/capture");
        await page
          .getByLabel("Link URL", { exact: true })
          .fill("https://fixture-links.dev/returning");
        await page.getByRole("button", { name: "Save link", exact: true }).click();
        await page.getByLabel("Email address").fill(email);
        await page.getByRole("button", { name: "Send code", exact: true }).click();
        await page.getByLabel("Eight-digit code").fill(await capturedCode(email));
        await page.getByRole("button", { name: "Verify and save" }).click();
        await browserExpect(page.locator(".form-notice")).toContainText("Choose where to save");
        await browserExpect(page.getByLabel("Link URL", { exact: true })).toHaveValue(
          "https://fixture-links.dev/returning",
        );
        await page.getByLabel("Save to", { exact: true }).selectOption(id);
        await page.getByRole("button", { name: "Save link", exact: true }).click();
        await browserExpect(page.locator(".resource-row")).toHaveCount(3);
      }
    } finally {
      failCapture = false;
      await close();
    }
  }
}, 60000);

it("saves several links with tags into a newly named collection, typing no titles", async () => {
  await prisma.requestBudget.deleteMany();
  const { page, close } = await freshPage();
  try {
    const email = `multi-${crypto.randomUUID()}@example.com`;
    const signed = await signInHubOwner(app.getHttpServer(), { email });
    const token = signed.headers["set-auth-token"];
    await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({ slug: `existing-${crypto.randomUUID()}`, title: "Existing shelf" })
      .expect(201);
    await browserSignIn(page, email, "/hub");
    await browserExpect(page.getByLabel("Account menu", { exact: true })).toBeVisible();
    await ready(page, "/capture");
    await browserExpect(page.locator("h1")).toHaveText("Save a link");
    const rows = page.locator(".capture-row");
    const first = rows.first().getByLabel("Link URL", { exact: true });
    // Something that is not an address turns the field red once left.
    await first.fill("example dot com");
    await first.blur();
    await browserExpect(first).toHaveAttribute("data-state", "invalid");
    await browserExpect(rows.first().locator(".capture-note.invalid")).toContainText("https://");
    // An address others can't open (local or example) is refused and blocks saving.
    await first.fill("http://localhost:8085/notebook/");
    await browserExpect(rows.first().locator(".capture-note.invalid")).toContainText(
      "public web address",
    );
    expect(await first.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    await rows
      .first()
      .getByLabel("Link URL", { exact: true })
      .fill("https://fixture-links.dev/one");
    await browserExpect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
    // Tags are optional: the field appears on request, focused, and tags
    // become chips as they are typed (Enter or a comma adds one).
    await browserExpect(rows.first().getByLabel("Tags", { exact: true })).toHaveCount(0);
    await rows.first().getByRole("button", { name: "Add tags", exact: true }).click();
    const tags = rows.first().getByLabel("Tags", { exact: true });
    await browserExpect(tags).toBeFocused();
    await tags.fill("video");
    await tags.press("Enter");
    await tags.pressSequentially("Beginner,");
    await tags.pressSequentially("draft");
    await browserExpect(rows.first().locator(".tag-chip")).toHaveText(["video×", "Beginner×"]);
    await rows.first().getByRole("button", { name: "Remove tag Beginner", exact: true }).click();
    await browserExpect(rows.first().locator('input[name="tags"]')).toHaveValue("video, draft");
    await page.getByRole("button", { name: "Add another link", exact: true }).click();
    await browserExpect(rows).toHaveCount(2);
    // Leaving the field shows the tags as on a collection, with "Add tags" after them.
    await browserExpect(rows.first().locator(".tag-summary .tags li")).toHaveText([
      "video",
      "draft",
    ]);
    await browserExpect(
      rows.first().getByRole("button", { name: "Add tags", exact: true }),
    ).toBeVisible();
    await browserExpect(rows.nth(1).getByLabel("Link URL", { exact: true })).toBeFocused();
    // Two links is the most per save; bulk import takes the place of adding more.
    await browserExpect(
      page.getByRole("button", { name: "Add another link", exact: true }),
    ).toHaveCount(0);
    const bulk = page.getByRole("button", { name: "Bulk import links", exact: true });
    await browserExpect(page.locator(".capture-bulk-note")).toBeHidden();
    await bulk.click();
    await browserExpect(page.locator(".capture-bulk-note")).toContainText("coming soon");
    // The same link twice is flagged and blocks saving.
    await rows
      .nth(1)
      .getByLabel("Link URL", { exact: true })
      .fill("https://fixture-links.dev/one/");
    await browserExpect(rows.nth(1).locator(".capture-note.invalid")).toContainText(
      "already in the list",
    );
    expect(
      await rows
        .nth(1)
        .getByLabel("Link URL", { exact: true })
        .evaluate((el: HTMLInputElement) => el.validity.valid),
    ).toBe(false);
    await page.getByRole("button", { name: "Remove link 2", exact: true }).click();
    await browserExpect(rows).toHaveCount(1);
    await page.getByRole("button", { name: "Add another link", exact: true }).click();
    await rows.nth(1).getByLabel("Link URL", { exact: true }).fill("https://fixture-links.dev/two");
    // Save stays reachable without scrolling on a 14-inch laptop viewport.
    await page.getByLabel("Save to", { exact: true }).selectOption({ index: 2 });
    await page.setViewportSize({ width: 1440, height: 790 });
    const save = page.getByRole("button", { name: "Save 2 links", exact: true });
    const box = await save.boundingBox();
    expect((box?.y ?? 9999) + (box?.height ?? 0)).toBeLessThanOrEqual(790);
    const name = page.getByLabel("Name for the new collection", { exact: true });
    await browserExpect(name).toBeHidden();
    await page.getByLabel("Save to", { exact: true }).selectOption("new");
    await browserExpect(name).toBeVisible();
    await browserExpect(name).toHaveValue(/^Saved links, /);
    await name.fill("Trading videos");
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: `/tmp/capture-several-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Save 2 links", exact: true }).click();
    await browserExpect(page.locator("h1")).toHaveText("Trading videos");
    await browserExpect(page.locator(".toast")).toContainText("Links saved");
    await browserExpect(page.locator(".resource-row")).toHaveCount(2);
    await browserExpect(page.locator(".resource-row").first()).toContainText(
      "fixture-links.dev/one",
    );
    await browserExpect(page.locator(".resource-row").first()).toContainText("video");
    await browserExpect(page.locator(".resource-row").first()).toContainText("draft");
    await browserExpect(page.locator(".resource-row").nth(1)).toContainText(
      "fixture-links.dev/two",
    );
  } finally {
    await close();
  }
}, 30000);

it("shows collection descriptions and hub attribution without repeated separators or a nested main scroller", async () => {
  const { page, close } = await freshPage();
  try {
    const signed = await signInHubOwner(app.getHttpServer(), {
      email: `description-${crypto.randomUUID()}@example.com`,
    });
    const token = signed.headers["set-auth-token"];
    const profile = await request(app.getHttpServer())
      .get("/api/v1/profile")
      .auth(token, { type: "bearer" })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(token, { type: "bearer" })
      .send({
        title: "A field guide to readable interfaces",
        slug: `description-${crypto.randomUUID()}`,
        published: true,
        description: "Collected notes and practical references. A second line for reading.",
      })
      .expect(201);
    await ready(page, "/discover");
    const row = page.locator(".collection-row").first();
    await browserExpect(row.locator(".preview")).toContainText("Collected notes");
    await browserExpect(row.locator(".row-meta a")).toHaveAttribute(
      "href",
      `/h/${profile.body.data.hubId}`,
    );
    await browserExpect(row.locator("time")).toBeVisible();
    expect(await row.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px");
    expect(await page.locator("main").evaluate((el) => getComputedStyle(el).overflowY)).toBe(
      "visible",
    );
    await page.locator("main").focus();
    await page.keyboard.press("PageDown");
    expect(await page.locator("main").evaluate((el) => el.scrollTop)).toBe(0);
    await page.screenshot({ path: "/tmp/capture-explore-rows.png", fullPage: true });
    await ready(page, "/");
    expect(
      await page
        .locator(".landing-discovery")
        .evaluate((el) => getComputedStyle(el).borderTopWidth),
    ).toBe("1px");
    expect(
      await page
        .locator(".collection-example .resource-row")
        .first()
        .evaluate((el) => getComputedStyle(el).borderTopWidth),
    ).toBe("0px");
  } finally {
    await close();
  }
}, 15000);

describe("collection discussion", () => {
  it("prompts signed-out readers, lets signed-in readers post and reply, shows the contributor's answer and honours the switch, with and without JavaScript", async () => {
    // Earlier journeys end the shared owner's session; this one has its own contributor.
    const curator = (
      await signInHubOwner(app.getHttpServer(), {
        email: `curator-${crypto.randomUUID()}@example.com`,
        name: "Curator",
      })
    ).headers["set-auth-token"] as string;
    for (const js of [true, false]) {
      const id = (
        await request(app.getHttpServer())
          .post("/api/v1/collections")
          .auth(curator, { type: "bearer" })
          .send({
            title: "Discussion guide",
            slug: `discussion-${crypto.randomUUID()}`,
            published: true,
          })
          .expect(201)
      ).body.data.id as string;
      const { page, close } = await freshPage(js);
      try {
        await ready(page, `/c/${id}`);
        const discussion = page.locator("#comments");
        await browserExpect(
          discussion.getByRole("link", { name: "Sign in to join the discussion", exact: true }),
        ).toBeVisible();
        const signInHref = await discussion
          .getByRole("link", { name: "Sign in to join the discussion", exact: true })
          .getAttribute("href");
        const destination = new URL(signInHref ?? "", origin).searchParams.get("returnTo");
        expect(destination).toBe(`/c/${id}?compose=comment#comment-composer`);
        // The sign-in screen says why it's asking.
        await ready(page, signInHref ?? "/sign-in");
        await browserExpect(page.locator(".verify-reason")).toHaveText(
          "Sign in to join the discussion.",
        );
        const discussant = `discussant-${crypto.randomUUID()}@example.com`;
        await browserSignIn(page, discussant, destination ?? "");
        await browserExpect(page.locator("h1")).toHaveText("Discussion guide");

        await browserExpect(page.getByLabel("Add to the discussion")).toBeVisible();
        if (js) await browserExpect(page.getByLabel("Add to the discussion")).toBeFocused();
        await browserExpect(page.getByLabel("Add to the discussion")).toHaveAttribute(
          "placeholder",
          "Ask a question or add a note…",
        );
        await browserExpect(discussion.locator(".comments-heading a")).toHaveCount(0);
        await page.getByLabel("Add to the discussion").fill(`Where do I start? (${js})`);
        await page.getByRole("button", { name: "Post", exact: true }).click();
        await browserExpect(page.locator(".toast")).toContainText("Comment posted");
        const question = discussion.locator("li", { hasText: `Where do I start? (${js})` }).first();
        await browserExpect(question.locator(".comment").first()).toBeVisible();

        await question.locator("summary", { hasText: "Reply" }).first().click();
        if (js) await browserExpect(question.getByLabel("Your reply")).toBeFocused();
        await question.getByLabel("Your reply").fill("Start with the first section.");
        await question.getByRole("button", { name: "Reply", exact: true }).click();
        await browserExpect(page.locator(".toast")).toContainText("Comment posted");
        await browserExpect(discussion.locator(".comment-replies")).toContainText(
          "Start with the first section.",
        );

        // A session that ends mid-post: sign in again and the comment is posted.
        await prisma.session.updateMany({
          where: { user: { email: discussant } },
          data: { expiresAt: new Date(0) },
        });
        if (!(await page.getByLabel("Add to the discussion").isVisible()))
          await discussion.locator(".comment-compose > summary").click();
        await page.getByLabel("Add to the discussion").fill(`After a break (${js})`);
        await page.getByRole("button", { name: "Post", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Sign in to continue");
        await browserExpect(page.locator(".verify-reason")).toContainText("post your comment");
        await page.getByLabel("Email address").fill(discussant);
        await page.getByRole("button", { name: "Send code", exact: true }).click();
        await page.getByLabel("Eight-digit code").fill(await capturedCode(discussant));
        await page.getByRole("button", { name: "Verify and continue" }).click();
        await browserExpect(page.locator("h1")).toHaveText("Discussion guide");
        await browserExpect(page.locator(".toast")).toContainText("Comment posted");
        await browserExpect(discussion).toContainText(`After a break (${js})`);

        // A different person signing in on this browser never runs it.
        await prisma.session.updateMany({
          where: { user: { email: discussant } },
          data: { expiresAt: new Date(0) },
        });
        if (!(await page.getByLabel("Add to the discussion").isVisible()))
          await discussion.locator(".comment-compose > summary").click();
        await page.getByLabel("Add to the discussion").fill(`Not theirs (${js})`);
        await page.getByRole("button", { name: "Post", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Sign in to continue");
        const stranger = `stranger-${crypto.randomUUID()}@example.com`;
        await page.getByLabel("Email address").fill(stranger);
        await page.getByRole("button", { name: "Send code", exact: true }).click();
        await page.getByLabel("Eight-digit code").fill(await capturedCode(stranger));
        await page.getByRole("button", { name: "Verify and continue" }).click();
        await browserExpect(page.locator("h1")).toHaveText("Discussion guide");
        await browserExpect(discussion).not.toContainText(`Not theirs (${js})`);
        expect(
          await prisma.collectionComment.count({ where: { body: `Not theirs (${js})` } }),
        ).toBe(0);

        await page.setViewportSize({ width: 1280, height: 700 });
        const composer = page.getByLabel("Add to the discussion");
        const prompt = discussion.locator(".comment-compose > summary");
        await browserExpect(composer).toBeHidden();
        await prompt.click();
        if (js) await browserExpect(composer).toBeFocused();
        await composer.fill("Draft retained while browsing");
        await prompt.click();
        await browserExpect(composer).toBeHidden();
        if (js) {
          // A window-switch modifier must not turn pointer focus into a ring.
          await page.keyboard.press("Alt");
          await prompt.focus();
          expect(await prompt.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
          // Keyboard navigation restores the visible indicator.
          await page.keyboard.press("Tab");
          await prompt.focus();
          expect(await prompt.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
        }
        await prompt.click();
        await browserExpect(composer).toHaveValue("Draft retained while browsing");
        const discussionBody = page.locator(".comments-body");
        const positions = () =>
          page.locator(".reader-side").evaluate((el) => ({
            heading: el.querySelector(".comments-heading")?.getBoundingClientRect().top,
          }));
        const fixed = await positions();
        if (js) {
          await browserExpect.poll(() => sidebarAlignment(page)).toBeLessThanOrEqual(1);
          const layoutBottom = await page
            .locator(".reader-layout")
            .evaluate((el) => el.getBoundingClientRect().bottom);
          const discussionBottom = await discussion.evaluate(
            (el) => el.getBoundingClientRect().bottom,
          );
          expect(discussionBottom).toBeLessThanOrEqual(layoutBottom + 1);
        }
        await discussionBody.focus();
        await discussionBody.press("End");
        await browserExpect
          .poll(() => discussionBody.evaluate((el) => el.scrollTop))
          .toBeGreaterThan(0);
        expect(await positions()).toEqual(fixed);
        expect(await page.locator(".sheet-body").evaluate((el) => el.scrollTop)).toBe(0);
        await discussionBody.press("Home");
        await browserExpect(composer).toBeInViewport();
        await browserExpect(composer).toHaveValue("Draft retained while browsing");
        await composer.fill("");

        // The contributor (owner) marks the reader's reply as the answer.
        const reply = await prisma.collectionComment.findFirstOrThrow({
          where: { collectionId: id, parentId: { not: null } },
        });
        await request(app.getHttpServer())
          .post(`/api/v1/comments/${reply.id}/accept`)
          .auth(curator, { type: "bearer" })
          .expect(200);
        await request(app.getHttpServer())
          .post(`/api/v1/collections/${id}/comments`)
          .auth(curator, { type: "bearer" })
          .send({ body: `From the contributor (${js})` })
          .expect(201);
        await page.reload();
        // "username · Contributor", then the age leads the actions.
        const mine = discussion.locator(".comment", { hasText: `From the contributor (${js})` });
        await browserExpect(mine.locator(".comment-head .comment-role")).toHaveText("Contributor");
        await browserExpect(mine.locator(".comment-head")).not.toContainText("Curator");
        await browserExpect(mine.locator(".comment-actions .comment-time")).toHaveText(
          /^(now|\d+s|\d+m)$/,
        );
        if (js) await mine.screenshot({ path: "/tmp/comment-contributor.png" });
        await browserExpect(discussion.locator(".comment.accepted")).toContainText(
          "Start with the first section.",
        );
        await browserExpect(discussion.locator(".comment-answer")).toHaveText("Answer");
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          if (js) await page.screenshot({ path: `/tmp/collection-discussion-${width}.png` });
        }

        const current = await request(app.getHttpServer())
          .get(`/api/v1/collections/${id}`)
          .auth(curator, { type: "bearer" })
          .expect(200);
        await request(app.getHttpServer())
          .patch(`/api/v1/collections/${id}`)
          .auth(curator, { type: "bearer" })
          .send({ commentsEnabled: false, version: current.body.data.version })
          .expect(200);
        await page.reload();
        await browserExpect(discussion).toContainText("Comments are turned off");
        await browserExpect(page.getByLabel("Add to the discussion")).toHaveCount(0);
        await browserExpect(discussion).toContainText("Start with the first section.");
      } finally {
        await close();
      }
    }
  }, 60000);
});

describe("support page", () => {
  it("lists the configured support address that every email footer points to, without JavaScript too", async () => {
    for (const js of [true, false]) {
      const { page, close } = await freshPage(js);
      try {
        await ready(page, "/support");
        await browserExpect(page.locator("h1")).toHaveText("Support");
        await browserExpect(
          page.getByRole("link", { name: "support@example.com", exact: true }),
        ).toHaveAttribute("href", "mailto:support@example.com");
        await browserExpect(page).toHaveTitle("Support · nslinkhub");
      } finally {
        await close();
      }
    }
  });
});

it("preserves a throttled resend journey beyond the normal resend interval", async () => {
  for (const js of [true, false]) {
    await prisma.requestBudget.deleteMany();
    const { page, close } = await freshPage(js);
    try {
      await ready(page, "/sign-in?returnTo=%2Fhub");
      await page.getByLabel("Email address").fill(`cooldown-${crypto.randomUUID()}@example.com`);
      await page.getByRole("button", { name: "Send code", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Check your email");
      await waitForResend(page);
      const key = requestBudgetKey(
        "auth",
        "127.0.0.1",
        process.env.BETTER_AUTH_SECRET ?? "dev-better-auth-secret",
      );
      await prisma.requestBudget.upsert({
        where: { key },
        create: { key, count: 30, expiresAt: new Date(Date.now() + 60000) },
        update: { count: 30, expiresAt: new Date(Date.now() + 60000) },
      });
      await page.getByRole("button", { name: "Send a new code", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Check your email");
      await browserExpect(
        page.getByRole("button", { name: "Send a new code", exact: true }),
      ).toBeDisabled();
      await browserExpect(page.locator(".field-help")).toContainText(/another code in [5-6]\d?s/);
      await page.reload();
      await browserExpect(page.locator("h1")).toHaveText("Check your email");
      await browserExpect(page.getByLabel("Eight-digit code")).toBeVisible();
    } finally {
      await close();
    }
  }
}, 30000);

it("continues replies on an older question page with the share token and answer intact", async () => {
  const signed = await signInHubOwner(app.getHttpServer(), {
    email: `reply-pages-${crypto.randomUUID()}@example.com`,
    name: "Reply contributor",
  });
  const bearer = signed.headers["set-auth-token"] as string;
  const result = await request(app.getHttpServer())
    .post("/api/v1/collections")
    .auth(bearer, { type: "bearer" })
    .send({ title: "Reply pages", slug: `replies-${crypto.randomUUID()}` })
    .expect(201);
  const id = result.body.data.id as string;
  const sharing = await request(app.getHttpServer())
    .put(`/api/v1/collections/${id}/link-sharing`)
    .auth(bearer, { type: "bearer" })
    .send({ enabled: true })
    .expect(200);
  const token = sharing.body.data.token as string;
  const base = Date.now() - 1000000;
  const question = await prisma.collectionComment.create({
    data: {
      collectionId: id,
      authorUserId: signed.body.user.id,
      body: "Older busy question",
      createdAt: new Date(base),
    },
  });
  await prisma.collectionComment.createMany({
    data: Array.from({ length: 21 }, (_, n) => ({
      collectionId: id,
      authorUserId: signed.body.user.id,
      body: `New question ${n}`,
      createdAt: new Date(base + 1000 + n * 1000),
    })),
  });
  await prisma.collectionComment.createMany({
    data: Array.from({ length: 105 }, (_, n) => ({
      collectionId: id,
      parentId: question.id,
      authorUserId: signed.body.user.id,
      body: n === 104 ? "Pinned late answer" : `Continuation reply ${n}`,
      accepted: n === 104,
      createdAt: new Date(base + n * 1000),
    })),
  });
  for (const js of [true, false]) {
    const { page, close } = await freshPage(js);
    try {
      await ready(page, `/c/${id}?s=${token}`);
      await page.getByRole("link", { name: "Older comments", exact: true }).click();
      await browserExpect(page.locator(`#comment-${question.id}`)).toContainText(
        "Older busy question",
      );
      const cursor = new URL(page.url()).searchParams.get("cc");
      await browserExpect(page.locator(".comment-replies .comment")).toHaveCount(100);
      await browserExpect(page.locator(".comment-replies .comment").first()).toContainText(
        "Pinned late answer",
      );
      await page.getByRole("link", { name: "More replies", exact: true }).click();
      await browserExpect(page.locator(".comment-replies .comment")).toHaveCount(6);
      await browserExpect(page.locator(".comment-replies .comment").first()).toContainText(
        "Pinned late answer",
      );
      await browserExpect(page.locator(".comment-replies")).toContainText("Continuation reply 103");
      expect(new URL(page.url()).searchParams.get("s")).toBe(token);
      expect(new URL(page.url()).searchParams.get("cc")).toBe(cursor);
      await browserExpect(
        page.getByRole("link", { name: "More replies", exact: true }),
      ).toHaveCount(0);
    } finally {
      await close();
    }
  }
}, 30000);

it("folds the collection introduction before scrolling links", async () => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const { page, close } = await freshPage();
    try {
      await page.emulateMedia({ reducedMotion });
      await page.setViewportSize({ width: 1280, height: 900 });
      await ready(page, `/c/${sourceId}`);
      const heading = page.locator(".collection-heading");
      const overview = heading.locator(".collection-overview");
      const body = page.locator(".sheet-body");
      await browserExpect(overview).toBeVisible();
      const titleStyle = await heading.locator("h1").evaluate((el) => ({
        size: getComputedStyle(el).fontSize,
        weight: getComputedStyle(el).fontWeight,
      }));
      await page.locator(".reader-side").evaluate((el) => el.dispatchEvent(new Event("scroll")));
      await browserExpect(overview).toBeVisible();
      await body.focus();
      const before = await body.evaluate((el) => el.clientHeight);
      const discussionTop = await page
        .locator(".comments")
        .evaluate((el) => el.getBoundingClientRect().top);
      await body.hover();
      if (reducedMotion === "no-preference") {
        const motion = await overview.evaluate((el) => {
          const expanded = el.getBoundingClientRect().height;
          el.dispatchEvent(
            new WheelEvent("wheel", { deltaY: 60, bubbles: true, cancelable: true }),
          );
          const animations = el.getAnimations();
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = 80;
          }
          const midway = el.getBoundingClientRect().height;
          const body = el.closest(".collection-sheet")?.querySelector(".sheet-body");
          // Continued input waits for the collapse instead of moving links early.
          el.dispatchEvent(
            new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }),
          );
          const scrollTop = body?.scrollTop;
          for (const animation of animations) animation.play();
          return { expanded, midway, scrollTop, count: animations.length };
        });
        expect(motion.count).toBeGreaterThan(0);
        expect(motion.midway).toBeGreaterThan(0);
        expect(motion.midway).toBeLessThan(motion.expanded);
        expect(motion.scrollTop).toBe(0);
      } else {
        await page.mouse.wheel(0, 60);
      }
      await browserExpect(heading).toHaveAttribute("data-folded", "true");
      await browserExpect(overview).toBeHidden();
      await browserExpect.poll(() => sidebarAlignment(page)).toBeLessThanOrEqual(1);
      expect(await page.locator(".comments").evaluate((el) => el.getBoundingClientRect().top)).toBe(
        discussionTop,
      );
      await browserExpect(heading.locator("h1")).toBeVisible();
      await browserExpect(heading.locator(".row-meta")).toBeVisible();
      await browserExpect(heading.locator(":scope > .tags")).toBeVisible();
      await browserExpect(body).toBeFocused();
      expect(await body.evaluate((el) => el.clientHeight)).toBeGreaterThan(before);
      if (reducedMotion === "reduce") {
        expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
        await page.mouse.wheel(0, 100);
      }
      await browserExpect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(
        await heading.locator("h1").evaluate((el) => ({
          size: getComputedStyle(el).fontSize,
          weight: getComputedStyle(el).fontWeight,
        })),
      ).toEqual(titleStyle);
      await page.screenshot({ path: `/tmp/collection-fold-${reducedMotion}.png` });
      await body.press("Home");
      await browserExpect(overview).toBeVisible();
      await body.press("ArrowDown");
      await browserExpect(overview).toBeHidden();
      await browserExpect.poll(() => sidebarAlignment(page)).toBeLessThanOrEqual(1);
      expect(await page.locator(".comments").evaluate((el) => el.getBoundingClientRect().top)).toBe(
        discussionTop,
      );
      expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
      await page.mouse.wheel(0, -60);
      await browserExpect(overview).toBeVisible();
      // Even a list that fits after folding must remain folded at scrollTop 0.
      await body.evaluate((el) => {
        el.querySelectorAll(".resource-row").forEach((row, index) => {
          if (index > 2) (row as HTMLElement).style.display = "none";
        });
      });
      await page.mouse.wheel(0, 60);
      await browserExpect(overview).toBeHidden();
      await browserExpect.poll(() => sidebarAlignment(page)).toBeLessThanOrEqual(1);
      expect(await page.locator(".comments").evaluate((el) => el.getBoundingClientRect().top)).toBe(
        discussionTop,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await browserExpect(overview).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await close();
    }
  }
  const { page, close } = await freshPage(false);
  try {
    await ready(page, `/c/${sourceId}`);
    await page.locator(".sheet-body").evaluate((el) => {
      el.scrollTop = 400;
    });
    await browserExpect(page.locator(".collection-overview")).toBeVisible();
  } finally {
    await close();
  }
}, 30000);

describe("activity and attribution", () => {
  it("shows contributors and a History of who changed what, for contributors only", async () => {
    const login = async (label: string, name: string) => {
      const email = `${label}-${crypto.randomUUID()}@example.com`;
      const res = await signInHubOwner(app.getHttpServer(), { email, name });
      return { email, token: res.headers["set-auth-token"] as string };
    };
    const owner = await login("history-owner", "Hana Owner");
    const editor = await login("history-editor", "Eli Editor");
    const created = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(owner.token, { type: "bearer" })
      .send({ slug: `history-${crypto.randomUUID().slice(0, 8)}`, title: "Shared guide" })
      .expect(201);
    const id = created.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${id}/shares`)
      .auth(owner.token, { type: "bearer" })
      .send({ email: editor.email, role: "contributor" })
      .expect(201);
    const firstItem = await request(app.getHttpServer())
      .post(`/api/v1/collections/${id}/resources/external`)
      .auth(editor.token, { type: "bearer" })
      .send({ url: "https://fixture-links.dev/history-section", position: 0 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${id}/resources/heading`)
      .auth(editor.token, { type: "bearer" })
      .send({
        title: "Basics",
        firstItemId: firstItem.body.data.id,
        firstItemVersion: firstItem.body.data.version,
      })
      .expect(201);
    // The owner acts last: the header still names the owner once.
    const current = await request(app.getHttpServer())
      .get(`/api/v1/collections/${id}`)
      .auth(owner.token, { type: "bearer" });
    await request(app.getHttpServer())
      .patch(`/api/v1/collections/${id}`)
      .auth(owner.token, { type: "bearer" })
      .send({ description: "Notes for the team.", version: current.body.data.version })
      .expect(200);
    const { page, close } = await freshPage();
    try {
      await browserSignIn(page, editor.email, `/c/${id}`);
      await browserExpect(page.locator("h1")).toHaveText("Shared guide");
      await browserExpect(page.locator(".collection-contributors .contributors-count")).toHaveText(
        "2",
      );
      for (const username of ["hana-owner", "eli-editor"]) {
        const person = page
          .locator(".contributor-list")
          .getByRole("link", { name: username, exact: true });
        await browserExpect(person).toHaveAttribute("href", `/${username}`);
        await browserExpect(person.locator("img")).toBeVisible();
        await browserExpect(person).toHaveText(username);
      }
      await page.screenshot({ path: "/tmp/attribution-header-desktop.png" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "/tmp/attribution-header-mobile.png" });
      await page.setViewportSize({ width: 1280, height: 800 });
      await page
        .locator(".collection-actions")
        .getByRole("link", { name: "Edit", exact: true })
        .click();
      await browserExpect(page.getByLabel("Collection name", { exact: true })).toHaveCount(0);
      await browserExpect(page.getByRole("link", { name: "Reorder", exact: true })).toBeVisible();
      await browserExpect(
        page.getByRole("link", { name: "Add section", exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "History", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("History");
      const latest = page.locator(".history-list li").first();
      await browserExpect(latest).toContainText("hana-owner");
      await browserExpect(latest).toContainText("changed the collection's details");
      const section = page.locator(".history-list li", { hasText: "added a section" });
      await browserExpect(section).toContainText("eli-editor");
      await browserExpect(section).toContainText("Basics");
      await browserExpect(page.locator(".history-list")).toContainText("created the collection");
      // Sharing is the owner's to see.
      await browserExpect(page.locator(".history-list")).not.toContainText("shared the collection");
      await page.screenshot({ path: "/tmp/attribution-history.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.screenshot({ path: "/tmp/attribution-history-dark.png", fullPage: true });
    } finally {
      await close();
    }
  }, 60000);
});

it("edits a hubless person's username and profile without creating a hub, with and without JavaScript", async () => {
  for (const js of [true, false]) {
    await prisma.requestBudget.deleteMany();
    const email = `hubless-browser-${crypto.randomUUID()}@example.com`;
    const { page, close } = await freshPage(js);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await browserSignIn(page, email, "/settings");
      const person = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(await prisma.hub.count({ where: { ownerUserId: person.id } })).toBe(0);
      await browserExpect(page.getByLabel("Handle", { exact: true })).toHaveCount(0);
      await settingsSection(page, "Notifications");
      await browserExpect(
        page.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();
      await settingsSection(page, "Hub");
      await browserExpect(
        page.getByRole("link", { name: "Save your first link", exact: true }),
      ).toBeVisible();
      await settingsSection(page, "Profile");
      const username = `rowan-${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
      await page.getByLabel("Full name", { exact: true }).fill("Rowan Reader");
      await browserExpect(page.getByLabel("Username", { exact: true })).toHaveAttribute(
        "maxlength",
        js ? "255" : "20",
      );
      await page.getByLabel("Username", { exact: true }).fill(username.toUpperCase());
      const bio = "Reader and curious builder.\nI write about <useful> things.";
      await page.getByLabel("Bio", { exact: true }).fill(bio);
      if (!js) await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
      await page.screenshot({ path: `/tmp/people-settings-hubless-${js}.png`, fullPage: true });
      await page.getByLabel("Account menu", { exact: true }).click();
      await page
        .getByRole("navigation", { name: "Account navigation" })
        .getByRole("link", { name: "Profile", exact: true })
        .click();
      await browserExpect(page).toHaveURL(`${origin}/${username}`);
      await browserExpect(page.locator("h1")).toHaveText("Rowan Reader");
      await browserExpect(page.locator("main")).toContainText("No public contributions yet.");
      await browserExpect(page.locator(".person-bio")).toHaveText(bio);
      await browserExpect(page.locator(".person-bio useful")).toHaveCount(0);
      expect(
        await page
          .locator(".person-bio")
          .evaluate((element) => getComputedStyle(element).whiteSpace),
      ).toBe("pre-wrap");
      await page.screenshot({ path: `/tmp/people-profile-hubless-${js}.png`, fullPage: true });
      await page.getByLabel("Account menu", { exact: true }).click();
      await page
        .getByRole("navigation", { name: "Account navigation" })
        .getByRole("link", { name: "Hub", exact: true })
        .click();
      await browserExpect(page).toHaveURL(`${origin}/hub`);
      await browserExpect(page.locator("h1")).toHaveText("Your hub");
      await browserExpect(
        page.getByRole("button", { name: "Create hub", exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: `/tmp/optional-hub-entry-${js}.png`, fullPage: true });
      expect(await prisma.hub.count({ where: { ownerUserId: person.id } })).toBe(0);
      await ready(page, "/settings");
      await browserExpect(
        page.getByRole("switch", { name: "Show owner", exact: true }),
      ).toHaveCount(0);
      await browserExpect(page.getByLabel("Bio", { exact: true })).toHaveValue(bio);
      await page.getByLabel("Bio", { exact: true }).fill("");
      if (!js) await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
      await ready(page, `/${username}`);
      await browserExpect(page.locator(".person-bio")).toHaveCount(0);
      await browserExpect(page.locator("h1")).toHaveText("Rowan Reader");
      await browserExpect(page.locator(".page-heading .meta").first()).toHaveText(username);
      const bounds = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width);
      await browserExpect(
        page.locator("main").getByRole("link", { name: "Edit profile", exact: true }),
      ).toHaveCount(0);
      await ready(page, "/hub");
      await page.getByRole("button", { name: "Create hub", exact: true }).click();
      await browserExpect(page).toHaveURL(/\/h\/[a-f0-9-]+$/);
      const hub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: person.id } });
      expect(await prisma.collection.count({ where: { hubId: hub.id } })).toBe(0);
      await ready(page, `/${username}`);
      await browserExpect(
        page.locator("main").getByRole("link", { name: new RegExp(hub.name) }),
      ).toHaveCount(1);
      await browserExpect(
        page.getByRole("button", { name: "Create hub", exact: true }),
      ).toHaveCount(0);
      await page.getByLabel("Account menu", { exact: true }).click();
      const accountNav = page.getByRole("navigation", { name: "Account navigation", exact: true });
      await browserExpect(accountNav.getByRole("link")).toHaveText([
        "Profile",
        "Hub",
        "Notifications",
        "Settings",
        "Manage",
      ]);
      await page.screenshot({ path: `/tmp/profile-hub-menu-${js}.png`, fullPage: true });
      await accountNav.getByRole("link", { name: "Hub", exact: true }).click();
      await browserExpect(page).toHaveURL(`${origin}/h/${hub.id}`);
    } finally {
      await close();
    }
  }
}, 45000);

it("finds only the title and validates links before sign-in, with a saveable lookup-failure fallback", async () => {
  const { page, close } = await freshPage();
  const setting = process.env.LINK_TITLES;
  const url = `https://fixture-links.dev/first-title-${crypto.randomUUID()}`;
  await prisma.linkMetadata.create({
    data: {
      url,
      title: "Why WorkLog became a notebook",
      description: "This belongs in collection details, not the save form.",
      siteName: "A notebook",
      state: "ready",
    },
  });
  process.env.LINK_TITLES = "on";
  try {
    await ready(page, "/capture");
    await browserExpect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    const input = page.getByLabel("Link URL", { exact: true });
    await input.fill(url);
    await browserExpect(page.locator(".capture-title")).toHaveText("Why WorkLog became a notebook");
    await browserExpect(input).toHaveAttribute("data-state", "valid");
    await browserExpect(page.locator("main")).not.toContainText(
      "This belongs in collection details",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: "/tmp/first-link-title-dark.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/first-link-title-mobile.png", fullPage: true });
    await input.fill("http://localhost/private");
    await input.blur();
    await browserExpect(input).toHaveAttribute("aria-invalid", "true");
    expect(await input.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(
      false,
    );
    await page.route("**/api/v1/link-preview?**", (route) => route.abort());
    await input.fill("https://fixture-links.dev/unavailable-title");
    await browserExpect(page.locator(".capture-note")).toContainText(
      "The link will still be saved.",
    );
    await browserExpect(page.locator(".capture-title.pending")).toHaveCount(0);
    expect(await input.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
    await page.getByRole("button", { name: "Save link", exact: true }).click();
    await browserExpect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  } finally {
    await close();
    if (setting === undefined) delete process.env.LINK_TITLES;
    else process.env.LINK_TITLES = setting;
  }
}, 30000);

it("shares Manage across owner and service contexts without exposing service controls to owners", async () => {
  const email = `manage-owner-${crypto.randomUUID()}@example.com`;
  const signed = await signInHubOwner(app.getHttpServer(), { email, name: "Manage owner" });
  const token = signed.headers["set-auth-token"];
  const created = await request(app.getHttpServer())
    .post("/api/v1/collections")
    .auth(token, { type: "bearer" })
    .send({ slug: `manage-${crypto.randomUUID()}`, title: "My private managed collection" })
    .expect(201);
  const colleagueEmail = `manage-colleague-${crypto.randomUUID()}@example.com`;
  const colleague = await signInWithCode(app.getHttpServer(), {
    email: colleagueEmail,
    name: "Colleague",
  });
  await request(app.getHttpServer())
    .post(`/api/v1/collections/${created.body.data.id}/shares`)
    .auth(token, { type: "bearer" })
    .send({ email: colleagueEmail })
    .expect(201);
  const person = await prisma.user.findUniqueOrThrow({ where: { id: colleague.body.user.id } });
  for (const js of [true, false]) {
    const { page, close } = await freshPage(js);
    try {
      await browserSignIn(page, email);
      await browserExpect(page.locator("h1")).toHaveText("Collections");
      const nav = page.getByRole("navigation", { name: "Manage", exact: true });
      await browserExpect(nav.getByRole("link")).toHaveText(["Access", "Collections", "Audit Log"]);
      await browserExpect(page.locator(".ops-table")).toContainText(
        "My private managed collection",
      );
      await nav.getByRole("link", { name: "Access", exact: true }).click();
      await browserExpect(page.locator(".ops-table")).toContainText(person.username);
      await nav.getByRole("link", { name: "Audit Log", exact: true }).click();
      await browserExpect(page.locator(".ops-table")).toContainText("Create collection");
      expect((await page.request.get(`${origin}/manage/audit/more`)).status()).toBe(200);
      if (js) await page.screenshot({ path: "/tmp/manage-owner-audit.png" });
    } finally {
      await close();
    }
  }
  await prisma.adminGrant.create({
    data: { userId: signed.body.user.id, invitationId: crypto.randomUUID() },
  });
  const { page, close } = await freshPage(true);
  try {
    await browserSignIn(page, email);
    const nav = page.getByRole("navigation", { name: "Manage", exact: true });
    await browserExpect(nav.getByRole("link")).toHaveText([
      "Accounts",
      "Access",
      "Collections",
      "Team",
      "Invitations",
      "Analytics",
      "Audit Log",
    ]);
    await nav.getByRole("link", { name: "Collections", exact: true }).click();
    await browserExpect(page.getByRole("link", { name: "My hub", exact: true })).toHaveCount(0);
    await browserExpect(page.getByRole("link", { name: "Service", exact: true })).toHaveCount(0);
    await browserExpect(page.locator(".ops-table")).toContainText("My private managed collection");
    await page.screenshot({ path: "/tmp/manage-admin-context.png" });
  } finally {
    await close();
  }
}, 60000);

it("sizes discussion by its own content within the reader frame, with and without JavaScript", async () => {
  for (const js of [true, false]) {
    await prisma.requestBudget.deleteMany();
    const email = `discussion-sizing-${crypto.randomUUID()}@example.com`;
    const signed = await signInWithCode(app.getHttpServer(), { email, name: "Reader" });
    const made = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(signed.headers["set-auth-token"] as string, { type: "bearer" })
      .send({
        title: "Flexible discussion",
        slug: `sizing-${crypto.randomUUID()}`,
        published: true,
      })
      .expect(201);
    const id = made.body.data.id as string;
    await prisma.resource.createMany({
      data: Array.from({ length: 20 }, (_, position) => ({
        collectionId: id,
        kind: "heading",
        titleOverride: `Reading section ${position + 1}`,
        position,
        addedByUserId: signed.body.user.id,
      })),
    });
    const { page, close } = await freshPage(js);
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await browserSignIn(page, email, `/c/${id}`);
      const bounds = () =>
        page.evaluate(() => {
          const rect = (selector: string) => {
            const element = document.querySelector(selector);
            if (!element) throw new Error(`Missing layout element: ${selector}`);
            return element.getBoundingClientRect();
          };
          const sheet = rect(".collection-sheet");
          const discussion = rect(".comments");
          const layout = rect(".reader-layout");
          const footer = rect(".site-footer");
          return {
            sheetHeight: sheet.height,
            sheetBottom: sheet.bottom,
            discussionHeight: discussion.height,
            discussionBottom: discussion.bottom,
            layoutBottom: layout.bottom,
            footerTop: footer.top,
          };
        });
      const empty = await bounds();
      expect(empty.sheetHeight).toBeGreaterThan(600);
      expect(empty.discussionHeight).toBeLessThan(250);
      await page.screenshot({ path: `/tmp/discussion-empty-${js}.png` });
      await page.locator(".comment-compose > summary").click();
      await browserExpect(page.getByLabel("Add to the discussion")).toBeVisible();
      expect((await bounds()).discussionHeight).toBeGreaterThan(empty.discussionHeight);
      await page.locator(".comment-compose > summary").click();

      await prisma.resource.deleteMany({ where: { collectionId: id, position: { gt: 0 } } });
      await ready(page, `/c/${id}`);
      const short = await bounds();
      await prisma.collectionComment.createMany({
        data: Array.from({ length: 20 }, (_, index) => ({
          collectionId: id,
          authorUserId: signed.body.user.id,
          body: `Discussion note ${index + 1}: a useful question about the reading.`,
        })),
      });
      await ready(page, `/c/${id}`);
      const busy = await bounds();
      expect(Math.abs(busy.sheetHeight - short.sheetHeight)).toBeLessThanOrEqual(1);
      expect(busy.discussionBottom).toBeGreaterThan(busy.sheetBottom + 100);
      expect(Math.abs(busy.discussionBottom - busy.layoutBottom)).toBeLessThanOrEqual(1);
      expect(busy.discussionBottom).toBeLessThan(busy.footerTop);
      const body = page.locator(".comments-body");
      const headingTop = await page
        .locator(".comments-heading")
        .evaluate((el) => el.getBoundingClientRect().top);
      await body.focus();
      await body.press("End");
      await browserExpect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(
        await page.locator(".comments-heading").evaluate((el) => el.getBoundingClientRect().top),
      ).toBe(headingTop);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({ path: `/tmp/discussion-busy-short-collection-${js}.png` });

      await page.setViewportSize({ width: 390, height: 844 });
      expect(await body.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await close();
    }
  }
}, 30000);

it("appends Manage table pages with fixed headers, retry and native fallback", async () => {
  await prisma.requestBudget.deleteMany();
  const op = await operatorFixture("manage-pagination");
  await prisma.adminGrant.deleteMany();
  await prisma.adminGrant.create({ data: { userId: op.id, invitationId: crypto.randomUUID() } });
  const hub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: op.id } });
  const prefix = `page-${crypto.randomUUID().slice(0, 8)}`;
  const people = await prisma.user.createManyAndReturn({
    data: Array.from({ length: 45 }, (_, i) => ({
      name: `${prefix} Person ${i}`,
      username: `${prefix}-${i}`,
      email: `${prefix}-${i}@example.com`,
    })),
  });
  await prisma.operatorGrant.createMany({
    data: people.map((p) => ({ userId: p.id, authority: "browser-pagination" })),
  });
  const collections = await prisma.collection.createManyAndReturn({
    data: Array.from({ length: 45 }, (_, i) => ({
      hubId: hub.id,
      title: `${prefix} Collection ${i}`,
      slug: `${prefix}-${i}`,
      creatorUserId: op.id,
    })),
  });
  await prisma.collectionShare.createMany({
    data: people.map((p) => ({
      collectionId: collections[0].id,
      userId: p.id,
      role: "viewer",
      source: "direct",
    })),
  });
  await prisma.serviceInvitation.createMany({
    data: people.map((p) => ({
      role: "operator",
      email: p.email,
      invitedById: op.id,
      expiresAt: new Date(Date.now() + 86400000),
    })),
  });
  await prisma.collectionHold.createMany({
    data: collections.map((c) => ({ collectionId: c.id, actorUserId: op.id, reason: "spam" })),
  });
  const paths = [
    "/manage",
    "/manage/people",
    "/manage/collections",
    "/manage/collections",
    "/manage/team",
    "/manage/invitations",
  ];
  for (const js of [true, false]) {
    const { page, close } = await freshPage(js);
    try {
      await browserSignIn(page, op.email, "/manage");
      for (const path of paths) {
        await ready(page, path);
        if (path === "/manage") {
          await page.getByRole("searchbox").fill(prefix);
          await page.getByRole("button", { name: "Search", exact: true }).click();
          expect(page.url()).not.toContain(prefix);
        }
        const rows = page.locator(".ops-table tbody tr");
        await browserExpect(rows).toHaveCount(20);
        // Hydration localizes timestamps; compare their stable values while
        // retaining the complete row content in the pagination/retry assertion.
        const contents = () =>
          rows.evaluateAll((elements) =>
            elements.map((element) => {
              const row = element.cloneNode(true) as HTMLElement;
              for (const time of row.querySelectorAll("time")) time.textContent = time.dateTime;
              return row.textContent;
            }),
          );
        const first = await contents();
        const load = page.getByRole("link", { name: "Load more", exact: true });
        const panel = page.locator(".ops-table-scroll");
        const headingTop = await page
          .locator("h1")
          .evaluate((el) => el.getBoundingClientRect().top);
        await panel.focus();
        await panel.press("End");
        await browserExpect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        expect(await page.evaluate(() => scrollY)).toBe(0);
        expect(await page.locator("h1").evaluate((el) => el.getBoundingClientRect().top)).toBe(
          headingTop,
        );
        await browserExpect(page.getByRole("columnheader").first()).toBeInViewport();
        if (!js) {
          await load.focus();
          await load.press("Enter");
          await browserExpect(page).toHaveURL(/cursor=/);
          await browserExpect(rows).toHaveCount(20);
          expect((await contents())[0]).not.toBe(first[0]);
          continue;
        }
        const address = page.url();
        if (path === "/manage") {
          await page.route(
            "**/manage?**",
            async (route) => {
              if (route.request().headers()["next-action"]) await route.abort();
              else await route.continue();
            },
            { times: 1 },
          );
          await load.click();
          await browserExpect(
            page.getByText("Couldn't load more. Your current results are still here."),
          ).toBeVisible();
          expect(await contents()).toEqual(first);
          await page.getByRole("button", { name: "Try again", exact: true }).click();
        } else await load.click();
        await browserExpect(rows).toHaveCount(40);
        expect((await contents()).slice(0, 20)).toEqual(first);
        expect(page.url()).toBe(address);
        for (let i = 0; i < 10 && (await load.count()); i++) {
          const before = await rows.count();
          await load.click();
          await browserExpect.poll(() => rows.count()).toBeGreaterThan(before);
        }
        await browserExpect(load).toHaveCount(0);
        expect(await rows.count()).toBeGreaterThanOrEqual(45);
        await browserExpect(
          page.getByRole("status").filter({ hasText: "All rows loaded." }),
        ).toBeAttached();
        if (path === "/manage/team") {
          const removable = rows
            .filter({ has: page.getByRole("button", { name: "Remove", exact: true }) })
            .last();
          await removable.getByRole("button", { name: "Remove", exact: true }).focus();
          await browserExpect(removable.locator('input[name="operationId"]')).toHaveAttribute(
            "value",
            /^[a-f0-9-]{36}$/,
          );
        }
      }
      if (js) {
        await ready(page, "/manage");
        await page.context().clearCookies();
        await page.getByRole("link", { name: "Load more", exact: true }).click();
        await browserExpect(page).toHaveURL(/sign-in/);
      }
    } finally {
      await close();
    }
  }
  await prisma.adminGrant.deleteMany({ where: { userId: op.id } });
}, 60000);

it("normalizes hub and service audit identities with full ID copying and stable actor filters", async () => {
  const op = await operatorFixture("audit-identities");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: op.id } });
  const hub = await prisma.hub.findUniqueOrThrow({ where: { ownerUserId: op.id } });
  const missing = "019abcde-0123-7000-8000-aaaa12345678";
  const other = "019abcde-0123-7000-8000-bbbb12345678";
  const collectionId = "019abcde-0123-7000-8000-cccc12345678";
  const resourceId = "019abcde-0123-7000-8000-dddd12345678";
  await prisma.auditLog.createMany({
    data: [missing, other].map((actorUserId) => ({
      hubId: hub.id,
      actorUserId,
      action: "collection.updated",
      collectionId,
    })),
  });
  await prisma.auditLog.create({
    data: { hubId: hub.id, actorUserId: op.id, action: "hub.name_changed" },
  });
  await prisma.auditLog.create({
    data: {
      hubId: hub.id,
      actorUserId: op.id,
      action: "item.link_added",
      collectionId,
      resourceId,
    },
  });
  await prisma.auditLog.create({
    data: {
      category: "operation",
      actorKind: "user",
      actorUserId: op.id,
      targetUserId: op.id,
      action: "account.suspend",
      outcome: "success",
      beforeState: "active",
      afterState: "suspended",
      reason: "spam",
    },
  });
  for (const js of [true, false]) {
    const { page, close } = await freshPage(js);
    try {
      await browserSignIn(page, op.email, "/manage/audit");
      await browserExpect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
      const actorCells = page.locator('td[data-label="Actor"]');
      await browserExpect(
        actorCells
          .locator("code")
          .filter({ hasText: op.id.split("-").at(-1) })
          .first(),
      ).toBeVisible();
      const itemTarget = page
        .locator("tr")
        .filter({ hasText: "Add link" })
        .locator('td[data-label="Target"]');
      await browserExpect(itemTarget.locator("code")).toHaveText("dddd12345678");
      await browserExpect(itemTarget.locator("[title]")).toHaveAttribute("title", resourceId);
      await browserExpect(itemTarget.locator("details")).toHaveCount(0);
      await browserExpect(
        page
          .locator("tr")
          .filter({ hasText: "Update collection details" })
          .first()
          .locator('td[data-label="Target"] code'),
      ).toHaveText("cccc12345678");
      const actorCell = actorCells.filter({ has: page.locator('code:text-is("aaaa12345678")') });
      await browserExpect(actorCell.locator("[title]")).toHaveAttribute("title", missing);
      await browserExpect(actorCell.locator("details")).toHaveCount(0);
      if (!js)
        await browserExpect(page.getByRole("button", { name: "Copy user ID" })).toHaveCount(0);
      if (js) {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await itemTarget.getByRole("button", { name: "Copy target ID", exact: true }).click();
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(resourceId);
        await browserExpect(itemTarget.getByRole("status")).toHaveText("Copied");
        await browserExpect(itemTarget.getByRole("status")).toBeEmpty();
        const actorCopy = actorCell.getByRole("button", { name: "Copy user ID", exact: true });
        await actorCopy.focus();
        await actorCopy.press("Enter");
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(missing);
        await browserExpect(actorCopy).toContainText("aaaa12345678");
        await browserExpect(actorCell.getByRole("status")).toHaveText("Copied");
      }
      await page.screenshot({ path: `/tmp/audit-identities-expanded-${js}.png` });
      await page.getByRole("searchbox", { name: "Search", exact: true }).fill(user.username);
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await browserExpect(page).toHaveURL(new RegExp(`q=${user.username}`));
      await browserExpect(
        actorCells.locator("code").filter({ hasText: "aaaa12345678" }),
      ).toHaveCount(0);
      expect(page.url()).not.toContain("scope=");
      await browserExpect(page.getByRole("navigation", { name: "Management context" })).toHaveCount(
        0,
      );
      await page.screenshot({ path: `/tmp/audit-identities-hub-${js}.png` });
      await ready(page, "/manage/audit");
      await page.getByRole("searchbox", { name: "Search", exact: true }).fill(user.username);
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await browserExpect(page).toHaveURL(new RegExp(`q=${user.username}`));
      await browserExpect(page.locator('td[data-label="Actor"] code').first()).toHaveText(
        op.id.split("-").at(-1) ?? op.id,
      );
      await page.screenshot({ path: `/tmp/audit-identities-service-${js}.png` });
      await browserExpect(page.locator(".ops-table thead th")).toHaveText([
        "Timestamp",
        "Actor",
        "Action",
        "Target",
        "Outcome",
        "Change",
      ]);
      let actorId = op.id;
      if (js) {
        await page
          .locator('td[data-label="Actor"]')
          .first()
          .getByRole("button", { name: "Copy user ID", exact: true })
          .click();
        actorId = await page.evaluate(() => navigator.clipboard.readText());
        expect(actorId).toBe(op.id);
      }
      await ready(page, "/manage");
      await page
        .getByRole("searchbox", { name: "User ID, username, email or hub handle", exact: true })
        .fill(actorId);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await browserExpect(page.locator(".ops-table tbody tr")).toHaveCount(1);
      await browserExpect(page.locator('td[data-label="Email"]')).toContainText(op.email);
      await browserExpect(page.locator('td[data-label="Email"]')).not.toContainText("Verified");
      await browserExpect(page.locator('td[data-label="Account"] .ops-primary')).toHaveText(
        user.name,
      );
      await browserExpect(page.locator('td[data-label="Account"] .ops-secondary')).toHaveText(
        user.username,
      );
      const accountRow = page.locator(".ops-table tbody tr").filter({ hasText: op.email });
      const loggedIn = await prisma.user.findUniqueOrThrow({ where: { id: op.id } });
      await browserExpect(accountRow.locator('td[data-label="Last login"] time')).toHaveAttribute(
        "datetime",
        loggedIn.lastLoginAt?.toISOString() ?? "missing-login",
      );
      await page.screenshot({ path: `/tmp/accounts-stable-id-${js}.png` });
      for (const width of [1280, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.screenshot({ path: `/tmp/audit-identities-mobile-${js}.png`, fullPage: true });
      await browserExpect(accountRow.locator('td[data-label="Member since"] time')).toHaveAttribute(
        "datetime",
        user.createdAt.toISOString(),
      );
      if (js) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await accountRow.locator('td[data-label="Email"]').click();
      } else await accountRow.getByRole("button", { name: user.name, exact: true }).click();
      await browserExpect(page.locator(".account-details")).toContainText("Last login");
      const currentUser = await prisma.user.findUniqueOrThrow({ where: { id: op.id } });
      await browserExpect(
        page
          .locator(".account-details dt")
          .filter({ hasText: /^Last login$/ })
          .locator("+ dd time"),
      ).toHaveAttribute("datetime", currentUser.lastLoginAt?.toISOString() ?? "missing-login");
      await browserExpect(page.locator("details.action-menu")).toHaveCount(0);
      await browserExpect(
        page
          .locator(".account-profile-heading")
          .getByRole("link", { name: user.username, exact: true }),
      ).toHaveAttribute("href", `/${encodeURIComponent(user.username)}`);
      await browserExpect(
        page.locator(".account-details").getByRole("link", { name: hub.name, exact: true }),
      ).toHaveAttribute("href", `/h/${hub.id}`);
      const sessions = page.getByRole("region", { name: "Active sessions", exact: true });
      await browserExpect(sessions).toContainText("Your current session");
      await browserExpect(sessions).toContainText("Last verified");
      await page.screenshot({ path: `/tmp/account-profile-${js}.png`, fullPage: true });
    } finally {
      await close();
    }
  }
}, 30000);

it("shows recorded audit effects, honest legacy gaps, international dates and optional reads", async () => {
  const op = await operatorFixture("audit-effects");
  const created = await request(app.getHttpServer())
    .post("/api/v1/collections")
    .auth(op.token, { type: "bearer" })
    .send({ title: "Audit evidence fixture", slug: `audit-evidence-${crypto.randomUUID()}` })
    .expect(201);
  const id = created.body.data.id as string;
  for (let i = 0; i < 2; i++)
    await request(app.getHttpServer())
      .post(`/api/v1/collections/${id}/publish`)
      .auth(op.token, { type: "bearer" })
      .expect(201);
  const captured = await prisma.auditLog.findFirstOrThrow({
    where: { collectionId: id, action: "collection.published", outcome: "success" },
  });
  const expectedLocal = new Date(captured.createdAt.getTime() + 3 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const expectedUtc = captured.createdAt.toISOString().slice(0, 19).replace("T", " ");
  const invitationId = crypto.randomUUID();
  await prisma.auditLog.create({
    data: {
      category: "operation",
      actorKind: "user",
      actorUserId: op.id,
      targetUserId: op.id,
      invitationId,
      action: "invitation.verified",
      beforeState: "verifying",
      afterState: "accepted",
      outcome: "success",
    },
  });
  for (const js of [true, false]) {
    const { page, close } = await freshPage(js, "Africa/Dar_es_Salaam");
    try {
      await browserSignIn(page, op.email, "/manage/audit");
      const table = page.locator(".ops-table");
      await browserExpect(table).not.toContainText("View audit");
      const changed = table.locator("tbody tr").filter({ hasText: "Unpublished → Published" });
      await browserExpect(changed.locator('td[data-label="Outcome"]')).toHaveText("Succeeded");
      await browserExpect(changed.locator('td[data-label="Change"]')).toHaveText(
        "Unpublished → Published",
      );
      await browserExpect(changed.locator('td[data-label="Target"] code')).toHaveText(
        id.split("-").at(-1) ?? id,
      );
      await browserExpect(table.locator("tbody tr").filter({ hasText: "No change" })).toContainText(
        "No change",
      );
      await browserExpect(
        table.locator("tbody tr").filter({ hasText: "Create collection" }),
      ).toContainText("Not recorded");
      await browserExpect(changed.locator("time")).toHaveText(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      );
      await browserExpect(changed.locator("time")).toHaveText(js ? expectedLocal : expectedUtc);
      const day = (js ? expectedLocal : expectedUtc).slice(0, 10);
      await page.getByLabel("From", { exact: true }).fill(day);
      await page.getByLabel("To", { exact: true }).fill(day);
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await browserExpect(page.getByLabel("From", { exact: true })).toHaveValue(day);
      const start = new Date(`${day}T00:00:00.000Z`).getTime() - (js ? 3 * 3600000 : 0);
      const query = new URL(page.url()).searchParams;
      expect(query.get("from")).toBe(new Date(start).toISOString());
      expect(query.get("to")).toBe(new Date(start + 86400000 - 1).toISOString());

      await page
        .getByRole("searchbox", { name: "Search", exact: true })
        .fill("Unpublished Published Succeeded");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await browserExpect(table.locator("tbody tr")).toHaveCount(1);
      await browserExpect(table.locator('td[data-label="Change"]')).toHaveText(
        "Unpublished → Published",
      );
      await browserExpect(page.getByRole("searchbox", { name: "Search", exact: true })).toHaveValue(
        "unpublished published succeeded",
      );
      await page.getByRole("searchbox", { name: "Search", exact: true }).fill("");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();

      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.screenshot({ path: `/tmp/audit-effects-hub-${js}.png`, fullPage: true });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.screenshot({ path: `/tmp/audit-effects-dark-${js}.png`, fullPage: true });
      await page.getByRole("checkbox", { name: "Include read events", exact: true }).check();
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await browserExpect(table).toContainText("View audit");
      await page.getByRole("link", { name: "Clear filters" }).click();
      await browserExpect(table).not.toContainText("View audit");
      await browserExpect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);
      await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("audit.read");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await browserExpect(
        page.getByRole("checkbox", { name: "Include read events", exact: true }),
      ).toBeChecked();
      await browserExpect(table).toContainText("Read only");
      await ready(page, `/manage/audit?targetId=${invitationId}`);
      const invitation = table
        .locator("tbody tr")
        .filter({ hasText: "Verify invitation acceptance" });
      await browserExpect(invitation.locator('td[data-label="Target"] code')).toHaveText(
        invitationId.split("-").at(-1) ?? invitationId,
      );
      await browserExpect(invitation).toContainText("Verifying → Accepted");
      await page.screenshot({ path: `/tmp/audit-effects-service-${js}.png`, fullPage: true });
    } finally {
      await close();
    }
  }
}, 60000);

it("uses action dialogs and owner collection operations with native fallback", async () => {
  for (const js of [true, false]) {
    const actor = await operatorFixture(`collection-actions-${js}`);
    const made = await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(actor.token, { type: "bearer" })
      .send({ title: "Collection action fixture", slug: `actions-${crypto.randomUUID()}` })
      .expect(201);
    const id = made.body.data.id;
    const { page, close } = await freshPage(js);
    try {
      await browserSignIn(page, actor.email, "/manage/collections");
      await browserExpect(page.getByRole("link", { name: "My hub", exact: true })).toHaveCount(0);
      await page.getByLabel("Collection ID or link", { exact: true }).fill(id);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const row = page.locator(".ops-table tbody tr");
      await browserExpect(row).toHaveCount(1);
      await browserExpect(
        page.getByRole("columnheader", { name: "Action", exact: true }),
      ).toHaveCount(0);
      if (js) {
        // Slow scripts must never expose a native disclosure before hydration.
        let releaseScripts = () => {};
        const scriptsReady = new Promise<void>((resolve) => {
          releaseScripts = resolve;
        });
        await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
          await scriptsReady;
          await route.continue();
        });
        try {
          await page.reload({ waitUntil: "commit" });
          const trigger = row.getByRole("button", {
            name: "Actions for Collection action fixture",
          });
          await browserExpect(trigger).toBeVisible();
          await browserExpect(trigger).toBeDisabled();
          await trigger.click({ force: true });
          await browserExpect(row.locator(".action-choices:visible")).toHaveCount(0);
          releaseScripts();
          await browserExpect(trigger).toBeEnabled();
          await row.locator('td[data-label="Status"]').click();
          await browserExpect(page.getByRole("dialog")).toBeVisible();
          await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
          await browserExpect(trigger).toBeFocused();
          await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
          await row.getByRole("button", { name: "Copy collection ID" }).click();
          expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(id);
          await browserExpect(page.getByRole("dialog")).toHaveCount(0);
          await trigger.focus();
          await page.keyboard.press("Enter");
          await browserExpect(page.getByRole("dialog")).toBeVisible();
          await page.keyboard.press("Escape");
          await browserExpect(trigger).toBeFocused();
        } finally {
          releaseScripts();
          await page.unroute(/\/_next\/static\/.*\.js(?:\?.*)?$/);
        }
      }
      if (js) {
        await row.locator('td[data-label="Status"]').click();
        const dialog = page.getByRole("dialog");
        await browserExpect(
          dialog.getByRole("link", { name: "View", exact: true }),
        ).toHaveAttribute("href", `/c/${id}`);
        await browserExpect(
          dialog.getByRole("link", { name: "Edit", exact: true }),
        ).toHaveAttribute("href", `/c/${id}/edit`);
        await browserExpect(
          dialog.getByRole("link", { name: "History", exact: true }),
        ).toHaveAttribute("href", `/c/${id}/history`);
        const shareHref = await dialog
          .getByRole("link", { name: "Share", exact: true })
          .getAttribute("href");
        const shareUrl = new URL(shareHref ?? "", origin);
        expect(shareUrl.pathname).toBe("/share");
        expect(Object.fromEntries(shareUrl.searchParams)).toEqual({
          kind: "collection",
          id,
          returnTo: `/manage/collections?q=${id}`,
        });
        const publish = dialog.getByRole("link", { name: "Publish", exact: true });
        const destination = await publish.getAttribute("href");
        // Keep the current document in place: disappearance must come from
        // selecting the action, not from the destination replacing the page.
        await publish.evaluate((link) => {
          link.addEventListener("click", (event) => event.preventDefault(), { once: true });
        });
        await publish.click();
        await browserExpect(dialog).toHaveCount(0);
        await ready(page, destination ?? "/manage/collections");
      } else {
        await chooseAction(page, "publish", row);
      }
      await page.getByRole("button", { name: "Publish collection", exact: true }).click();
      await browserExpect(page.getByText("The action is complete.", { exact: true })).toBeVisible();
      expect((await prisma.collection.findUniqueOrThrow({ where: { id } })).published).toBe(true);
      await ready(page, `/c/${id}`);
      await page.locator(".sheet-bar").getByRole("link", { name: "Share", exact: true }).click();
      await browserExpect(page.getByLabel("Collection link", { exact: true })).toHaveValue(
        `${origin}/c/${id}`,
      );
      const copyLink = page.getByRole("button", { name: "Copy link", exact: true });
      await browserExpect(copyLink).toBeVisible();
      await browserExpect(
        page.getByRole("link", { name: "Back to collection", exact: true }),
      ).toHaveAttribute("href", `/c/${id}`);
      if (js) {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await copyLink.click();
        await browserExpect(
          page.getByRole("status").filter({ hasText: "Link copied." }),
        ).toBeVisible();
        const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
        expect(copied.origin + copied.pathname).toBe(`${origin}/c/${id}`);
        expect(copied.searchParams.get("via")).toBeTruthy();
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          const copy = page.getByRole("button", { name: "Copy link", exact: true });
          await browserExpect(copy).toBeVisible();
          await browserExpect(page.getByRole("link", { name: "Cancel", exact: true })).toHaveCount(
            0,
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({ path: `/tmp/collection-share-buttons-${width}.png` });
        }
        await page.setViewportSize({ width: 1280, height: 900 });
      } else {
        await browserExpect(copyLink).toBeDisabled();
        await browserExpect(
          page.getByText("Select the link above and copy it.", { exact: true }),
        ).toBeVisible();
      }
      await page.getByRole("link", { name: "Back to collection", exact: true }).click();
      await browserExpect(page).toHaveURL(`${origin}/c/${id}`);
      await ready(page, `/manage/collections?q=${id}`);
      await chooseAction(page, "share", page.locator(".ops-table tbody tr"));
      await page.screenshot({ path: `/tmp/collection-share-${js}.png` });
      await page.reload();
      await page.getByRole("link", { name: "Back to collections", exact: true }).click();
      await browserExpect(page).toHaveURL(`${origin}/manage/collections?q=${id}`);
      const direct = await freshPage(js);
      try {
        await ready(direct.page, `/share?kind=collection&id=${id}`);
        await browserExpect(
          direct.page.getByRole("link", { name: "Back to collection", exact: true }),
        ).toHaveAttribute("href", `/c/${id}`);
        await direct.page.getByRole("link", { name: "Back to collection", exact: true }).click();
        await browserExpect(direct.page).toHaveURL(`${origin}/c/${id}`);
      } finally {
        await direct.close();
      }
      if (js) {
        const trigger = page.getByRole("button", { name: "Actions for Collection action fixture" });
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await browserExpect(dialog).toBeVisible();
        const bounds = await dialog.boundingBox();
        expect(
          Math.abs(
            (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2 - (page.viewportSize()?.width ?? 0) / 2,
          ),
        ).toBeLessThan(2);
        await browserExpect(dialog.getByRole("link", { name: "Share", exact: true })).toBeVisible();
        await page.screenshot({ path: "/tmp/manage-action-dialog.png", animations: "disabled" });
        await page.emulateMedia({ colorScheme: "dark" });
        await page.screenshot({
          path: "/tmp/manage-action-dialog-dark.png",
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
        await browserExpect(trigger).toBeFocused();
        await page.setViewportSize({ width: 390, height: 844 });
        await trigger.click();
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await page.screenshot({ path: "/tmp/manage-action-dialog-mobile.png" });
        await page.keyboard.press("Escape");
      }
      await chooseAction(page, "unpublish", page.locator(".ops-table tbody tr"));
      await page.getByRole("button", { name: "Unpublish collection", exact: true }).click();
      await ready(page, `/share?kind=collection&id=${id}`);
      await page.getByRole("button", { name: "Create share link", exact: true }).click();
      const link = page.getByLabel("Collection link", { exact: true }).last();
      await browserExpect(link).toHaveValue(new RegExp(`/c/${id}\\?s=`));
      expect(
        (await prisma.collection.findUniqueOrThrow({ where: { id } })).linkSharingEnabled,
      ).toBe(true);
      await ready(page, `/manage/collections?q=${id}`);
      await chooseAction(page, "delete", page.locator(".ops-table tbody tr"));
      await browserExpect(page.getByText(/This cannot be undone/)).toBeVisible();
      await page.getByRole("button", { name: "Delete collection", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Collections");
      expect(await prisma.collection.findUnique({ where: { id } })).toBeNull();
    } finally {
      await close();
    }
  }
}, 60000);

it("shares profiles, hubs, collections and the site through one contextual page", async () => {
  const signed = await signInHubOwner(app.getHttpServer(), {
    email: `sharing-${crypto.randomUUID()}@example.com`,
    name: "Sharing fixture",
  });
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: signed.body.user.id },
    include: { hub: true },
  });
  const token = signed.headers["set-auth-token"];
  const create = async (published: boolean) =>
    (
      await request(app.getHttpServer())
        .post("/api/v1/collections")
        .auth(token, { type: "bearer" })
        .send({
          title: published ? "Shareable collection" : "Restricted share fixture",
          slug: `share-${crypto.randomUUID()}`,
          published,
        })
        .expect(201)
    ).body.data.id as string;
  const publicId = await create(true),
    restrictedId = await create(false);
  const access = (
    await request(app.getHttpServer())
      .put(`/api/v1/collections/${restrictedId}/link-sharing`)
      .auth(token, { type: "bearer" })
      .send({ enabled: true })
      .expect(200)
  ).body.data.token as string;
  const ownedHub = actor.hub;
  if (!ownedHub) throw new Error("Sharing fixture requires a hub");
  for (const js of [true, false]) {
    const { page, close } = await freshPage(js);
    try {
      const cases = [
        {
          from: `/${actor.username}`,
          kind: "profile",
          path: `/people/${actor.id}`,
          label: "Profile link",
          heading: "Share profile",
          back: "Back to profile",
          trigger: "Share",
        },
        {
          from: `/@${ownedHub.handle}?view=public`,
          kind: "hub",
          path: `/h/${ownedHub.id}`,
          label: "Hub link",
          heading: "Share hub",
          back: "Back to hub",
          trigger: "Share",
        },
        {
          from: `/c/${publicId}`,
          kind: "collection",
          path: `/c/${publicId}`,
          label: "Collection link",
          heading: "Share collection",
          back: "Back to collection",
          trigger: "Share",
        },
        {
          from: "/",
          kind: "site",
          path: "/",
          label: "Site link",
          heading: "Share nslinkhub",
          back: "Back to home",
          trigger: "Share nslinkhub",
        },
      ];
      if (js) await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      for (const item of cases) {
        await ready(page, item.from);
        await page.getByRole("link", { name: item.trigger, exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText(item.heading);
        expect(new URL(page.url()).pathname).toBe("/share");
        await browserExpect(page.getByLabel(item.label, { exact: true })).toHaveValue(
          `${origin}${item.path}`,
        );
        const copy = page.getByRole("button", { name: "Copy link", exact: true });
        await browserExpect(copy).toBeVisible();
        if (js) {
          await copy.click();
          expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
            `${origin}${item.path}`,
          );
        } else await browserExpect(copy).toBeDisabled();
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          await page.screenshot({ path: `/tmp/share-${item.kind}-${js}-${width}.png` });
        }
        await page.getByRole("link", { name: item.back, exact: true }).click();
        await browserExpect(page).toHaveURL(`${origin}${item.from}`);
      }
      await ready(page, `/share?kind=collection&id=${restrictedId}`);
      await browserExpect(page.getByLabel("Collection link", { exact: true })).toHaveCount(0);
      await browserExpect(page.locator("main")).not.toContainText("Restricted share fixture");
      await ready(
        page,
        `/share?${new URLSearchParams({ kind: "collection", id: restrictedId, s: access })}`,
      );
      await browserExpect(page.getByLabel("Collection link", { exact: true })).toHaveValue(
        `${origin}/c/${restrictedId}?s=${encodeURIComponent(access)}`,
      );
      await ready(
        page,
        `/share?${new URLSearchParams({ kind: "collection", id: publicId, s: access, returnTo: "https://outside.invalid/", url: "https://outside.invalid/", name: "Untrusted title" })}`,
      );
      await browserExpect(page.getByLabel("Collection link", { exact: true })).toHaveValue(
        `${origin}/c/${publicId}`,
      );
      await browserExpect(
        page.getByRole("link", { name: "Back to home", exact: true }),
      ).toHaveAttribute("href", "/");
      await browserExpect(page.locator("main")).not.toContainText("Untrusted title");
      await ready(page, `/people/${actor.id}`);
      await browserExpect(page.locator("h1")).toHaveText("Sharing fixture");
      const unavailable = await page.goto(`${origin}/share?kind=unsupported`);
      expect(unavailable?.status()).toBe(404);
      await browserExpect(page.getByRole("button", { name: "Copy link", exact: true })).toHaveCount(
        0,
      );
    } finally {
      await close();
    }
  }
}, 60000);

it("records authenticated copy links and successful opens across all share targets", async () => {
  const signed = await signInHubOwner(app.getHttpServer(), {
    email: `share-cycle-${crypto.randomUUID()}@example.com`,
    name: "Sharing cycle",
  });
  const actor = await prisma.user.findUniqueOrThrow({
    where: { id: signed.body.user.id },
    include: { hub: true },
  });
  const collection = (
    await request(app.getHttpServer())
      .post("/api/v1/collections")
      .auth(signed.headers["set-auth-token"], { type: "bearer" })
      .send({ title: "Sharing cycle guide", slug: `cycle-${crypto.randomUUID()}`, published: true })
      .expect(201)
  ).body.data;
  const { page, close } = await freshPage();
  const recipient = await freshPage();
  try {
    for (const raw of signed.headers["set-cookie"] as unknown as string[]) {
      const [name, ...value] = raw.split(";")[0].split("=");
      await page.context().addCookies([{ name, value: value.join("="), url: origin }]);
    }
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    for (const [kind, id, label] of [
      ["profile", actor.id, "Profile link"],
      ["hub", actor.hub?.id, "Hub link"],
      ["collection", collection.id, "Collection link"],
      ["site", null, "Site link"],
    ]) {
      const query = new URLSearchParams({ kind: kind as string });
      if (id) query.set("id", id);
      const before = await prisma.shareEntry.count({ where: { createdByUserId: actor.id } });
      await ready(page, `/share?${query}`);
      expect(await prisma.shareEntry.count({ where: { createdByUserId: actor.id } })).toBe(before);
      await page.getByRole("button", { name: "Copy link", exact: true }).click();
      await browserExpect(
        page.getByRole("status").filter({ hasText: "Link copied." }),
      ).toBeVisible();
      const link = await page.evaluate(() => navigator.clipboard.readText());
      await browserExpect(page.getByLabel(label as string, { exact: true })).toHaveValue(link);
      const shareId = new URL(link).searchParams.get("via");
      expect(shareId).toBeTruthy();
      const stored = await prisma.shareEntry.findUniqueOrThrow({
        where: { id: shareId as string },
      });
      expect(stored.createdByUserId).toBe(actor.id);
      expect(stored.context).toEqual({ destination: "copy_link" });
      expect(stored.message).toBe(`Share ${kind}`);
      expect(stored.resourceId).toBe(id);
      expect(stored.openCount).toBe(0);
      await page.getByRole("button", { name: "Copy link", exact: true }).click();
      expect(await prisma.shareEntry.count({ where: { createdByUserId: actor.id } })).toBe(
        before + 1,
      );
      await recipient.page.request.get(link);
      expect(
        (await prisma.shareEntry.findUniqueOrThrow({ where: { id: stored.id } })).openCount,
      ).toBe(0);
      const attributedLink = new URL(link);
      attributedLink.searchParams.set("utm_source", "newsletter");
      attributedLink.searchParams.set("utm_campaign", "reading-week");
      attributedLink.searchParams.set("unrelated", "do-not-store");
      await recipient.page.goto(attributedLink.href);
      await browserExpect
        .poll(
          async () =>
            (await prisma.shareEntry.findUniqueOrThrow({ where: { id: stored.id } })).openCount,
        )
        .toBe(1);
      await recipient.page.reload();
      await browserExpect
        .poll(
          async () =>
            (await prisma.shareEntry.findUniqueOrThrow({ where: { id: stored.id } })).openCount,
        )
        .toBe(2);
      expect(await prisma.shareOpen.count({ where: { shareId: stored.id } })).toBe(2);
      const opens = await prisma.shareOpen.findMany({ where: { shareId: stored.id } });
      expect(opens[0].eventId).not.toBe(opens[1].eventId);
      expect(opens[0].payloadHash).toBe(opens[1].payloadHash);
      expect(opens[0].occurredAt).toBeInstanceOf(Date);
      expect(opens[0].attribution).toEqual({
        utm_source: "newsletter",
        utm_campaign: "reading-week",
      });
      expect(JSON.stringify(opens)).not.toContain("do-not-store");
    }
    const privateCollection = (
      await request(app.getHttpServer())
        .post("/api/v1/collections")
        .auth(signed.headers["set-auth-token"], { type: "bearer" })
        .send({ title: "Private tracked collection", slug: `private-cycle-${crypto.randomUUID()}` })
        .expect(201)
    ).body.data;
    const privateEntry = (
      await request(app.getHttpServer())
        .post("/api/v1/share")
        .auth(signed.headers["set-auth-token"], { type: "bearer" })
        .send({ kind: "collection", id: privateCollection.id })
        .expect(201)
    ).body.data;
    await recipient.page.goto(`${privateEntry.resource.url}&utm_source=email`);
    await browserExpect(recipient.page.locator("h1")).toHaveText(
      "This collection isn't available.",
    );
    const signIn = recipient.page
      .locator("main")
      .getByRole("link", { name: "Sign in", exact: true });
    const resumePath = new URL(
      (await signIn.getAttribute("href")) as string,
      origin,
    ).searchParams.get("returnTo");
    expect(resumePath).toBe(`${privateEntry.resource.path}&utm_source=email`);
    expect(
      (await prisma.shareEntry.findUniqueOrThrow({ where: { id: privateEntry.id } })).openCount,
    ).toBe(0);
    await browserSignIn(recipient.page, actor.email, resumePath as string);
    await browserExpect(recipient.page.locator("h1")).toHaveText("Private tracked collection");
    await browserExpect
      .poll(
        async () =>
          (await prisma.shareEntry.findUniqueOrThrow({ where: { id: privateEntry.id } })).openCount,
      )
      .toBe(1);
  } finally {
    await close();
    await recipient.close();
  }
}, 60000);

it("shows sharing analytics to operators and admins and refreshes after copying and opening", async () => {
  await prisma.shareEntry.deleteMany();
  const operator = await signInHubOwner(app.getHttpServer(), {
    email: `analytics-op-${crypto.randomUUID()}@example.com`,
    name: "Analytics operator",
  });
  const admin = await signInWithCode(app.getHttpServer(), {
    email: `analytics-admin-${crypto.randomUUID()}@example.com`,
    name: "Analytics admin",
  });
  await prisma.operatorGrant.create({ data: { userId: operator.body.user.id, authority: "test" } });
  await prisma.adminGrant.create({
    data: { userId: admin.body.user.id, invitationId: crypto.randomUUID() },
  });
  const operatorBrowser = await freshPage();
  const adminBrowser = await freshPage(false);
  const recipient = await freshPage();
  const page = operatorBrowser.page;
  try {
    for (const [target, signed] of [
      [page, operator],
      [adminBrowser.page, admin],
    ] as const) {
      for (const raw of signed.headers["set-cookie"] as unknown as string[]) {
        const [name, ...value] = raw.split(";")[0].split("=");
        await target.context().addCookies([{ name, value: value.join("="), url: origin }]);
      }
    }
    await recipient.page.goto(`${origin}/manage/analytics`);
    await browserExpect(recipient.page).toHaveURL(/\/sign-in\?/);
    expect(new URL(recipient.page.url()).searchParams.get("returnTo")).toBe("/manage/analytics");
    await ready(page, "/manage/analytics");
    await browserExpect(page.locator("[data-metric=shares]")).toHaveText("0");
    await browserExpect(page.locator("[data-metric=opens]")).toHaveText("0");
    await browserExpect(page.getByText(/No shares recorded yet/)).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Manage", exact: true });
    expect((await nav.getByRole("link").allTextContents()).slice(-2)).toEqual([
      "Analytics",
      "Audit Log",
    ]);
    await browserExpect(nav.getByRole("link", { name: "Analytics", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const sharing = await page.context().newPage();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await ready(sharing, "/share?kind=site");
    await sharing.getByRole("button", { name: "Copy link", exact: true }).click();
    await browserExpect(
      sharing.getByRole("status").filter({ hasText: "Link copied." }),
    ).toBeVisible();
    const link = await sharing.getByLabel("Site link", { exact: true }).inputValue();
    const shareId = new URL(link).searchParams.get("via") as string;
    expect(shareId).toBeTruthy();
    expect((await prisma.shareEntry.findUniqueOrThrow({ where: { id: shareId } })).message).toBe(
      "Share site",
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await browserExpect(page.locator("[data-metric=shares]")).toHaveText("1");
    await browserExpect(page.locator("[data-metric=opens]")).toHaveText("0");
    await recipient.page.goto(link);
    await browserExpect
      .poll(
        async () =>
          (await prisma.shareEntry.findUniqueOrThrow({ where: { id: shareId } })).openCount,
      )
      .toBe(1);
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await browserExpect(page.locator("[data-metric=opens]")).toHaveText("1");
    await browserExpect(page.getByRole("table", { name: "Sharing by destination" })).toContainText(
      "Copy link",
    );
    await browserExpect(page.getByRole("table", { name: "Sharing by resource" })).toContainText(
      "Site",
    );
    await page.screenshot({ path: "/tmp/manage-analytics-light.png", fullPage: true });
    await recipient.page.reload();
    await browserExpect
      .poll(
        async () =>
          (await prisma.shareEntry.findUniqueOrThrow({ where: { id: shareId } })).openCount,
      )
      .toBe(2);
    await ready(adminBrowser.page, "/manage/analytics");
    await browserExpect(adminBrowser.page.locator("[data-metric=opens]")).toHaveText("2");
    expect(
      (
        await adminBrowser.page
          .getByRole("navigation", { name: "Manage", exact: true })
          .getByRole("link")
          .allTextContents()
      ).slice(-2),
    ).toEqual(["Analytics", "Audit Log"]);
    await adminBrowser.page.getByRole("button", { name: "Refresh", exact: true }).click();
    await browserExpect(adminBrowser.page.locator("[data-metric=shares]")).toHaveText("1");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: "/tmp/manage-analytics-dark-phone.png", fullPage: true });
    await prisma.operatorGrant.delete({ where: { userId: operator.body.user.id } });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await browserExpect(page.locator("h1")).toHaveText("Manage unavailable");
    await ready(page, "/manage/collections");
    await browserExpect(
      page
        .getByRole("navigation", { name: "Manage", exact: true })
        .getByRole("link", { name: "Analytics", exact: true }),
    ).toHaveCount(0);
  } finally {
    await operatorBrowser.close();
    await adminBrowser.close();
    await recipient.close();
  }
}, 60000);

describe("item details routes", () => {
  for (const js of [true, false]) {
    it(`opens items beyond the first page on both addresses, preserves access and toggles inline (${js})`, async () => {
      const signed = await signInHubOwner(app.getHttpServer(), {
        email: `item-routes-${crypto.randomUUID()}@example.com`,
        name: "Item owner",
      });
      const owner = signed.headers["set-auth-token"] as string;
      const profile = await request(app.getHttpServer())
        .get("/api/v1/profile")
        .auth(owner, { type: "bearer" })
        .expect(200);
      const handle = profile.body.data.handle;
      const slug = `item-routes-${crypto.randomUUID()}`;
      const created = await request(app.getHttpServer())
        .post("/api/v1/collections")
        .auth(owner, { type: "bearer" })
        .send({
          title: "Item route guide",
          slug,
          description: "A guide with enough context to fold while reading its items.",
        })
        .expect(201);
      const id = created.body.data.id as string;
      await prisma.resource.create({
        data: {
          collectionId: id,
          kind: "heading",
          titleOverride: "A later section",
          sectionDescription: "Context stays visible when this section is collapsed.",
          position: 22,
        },
      });
      await prisma.resource.createMany({
        data: Array.from({ length: 21 }, (_, position) => ({
          collectionId: id,
          kind: "external_link",
          url: `https://fixture-links.dev/earlier-${position}`,
          position,
        })),
      });
      const link = await prisma.resource.create({
        data: {
          collectionId: id,
          kind: "external_link",
          url: "https://fixture-links.dev/details",
          position: 23,
          tags: await itemTags(prisma, ["reference"]),
        },
      });
      await prisma.linkMetadata.upsert({
        where: { url: link.url as string },
        create: {
          url: link.url as string,
          state: "ready",
          fetchedAt: new Date(),
          title: "A useful resource",
          description: "Context for this saved link.",
          siteName: "Reference library",
        },
        update: {
          state: "ready",
          fetchedAt: new Date(),
          title: "A useful resource",
          description: "Context for this saved link.",
          siteName: "Reference library",
        },
      });
      const shared = await request(app.getHttpServer())
        .put(`/api/v1/collections/${id}/link-sharing`)
        .auth(owner, { type: "bearer" })
        .send({ enabled: true })
        .expect(200);
      const token = shared.body.data.token;
      const first = await request(app.getHttpServer())
        .get(`/api/v1/collections/${id}/resources`)
        .query({ s: token })
        .expect(200);
      const cursor = first.body.meta.nextCursor;
      const { page, close } = await freshPage(js);
      try {
        for (const base of [`/c/${id}`, `/@${handle}/${slug}`]) {
          const query = new URLSearchParams({ s: token, cursor });
          await ready(page, `${base}?${query}`);
          const sectionGroup = page.locator(".resource-section");
          const sectionToggle = sectionGroup.locator("summary").first();
          const row = page.locator(`#item-${link.id}`);
          const details = row.locator(".item-context");
          await browserExpect(page.getByRole("dialog")).toHaveCount(0);
          await browserExpect(details).not.toBeVisible();
          await row.locator(".resource-meta").click();
          await browserExpect(details).toBeVisible();
          await row.locator(".resource-meta").click();
          await browserExpect(details).not.toBeVisible();
          await row.locator("summary").focus();
          await page.keyboard.press("Enter");
          await browserExpect(details).toContainText("Context for this saved link.");
          await browserExpect(details).toBeVisible();
          if (js) {
            await details.locator(".description").evaluate((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              window.getSelection()?.removeAllRanges();
              window.getSelection()?.addRange(range);
              (element as HTMLElement).click();
            });
            await browserExpect(details).toBeVisible();
            await page.evaluate(() => window.getSelection()?.removeAllRanges());
            await details.locator(".description").click();
            await browserExpect(details).not.toBeVisible();
            await row.locator(".resource-meta").click();
            await browserExpect(details).toBeVisible();
            await row.locator(".resource-disclosure").click({ position: { x: 2, y: 2 } });
            await browserExpect(details).not.toBeVisible();
            await row.locator(".resource-meta").click();
            await row.locator("h2 a").evaluate((element) =>
              element.addEventListener("click", (event) => event.preventDefault(), {
                once: true,
              }),
            );
            await row.locator("h2 a").click();
            await browserExpect(details).toBeVisible();
          }
          if (js)
            await browserExpect
              .poll(() => new URL(page.url()).searchParams.get("item"))
              .toBe(link.id);
          else expect(new URL(page.url()).searchParams.has("item")).toBe(false);
          const destination = await details
            .getByRole("link", { name: "Link to this item" })
            .getAttribute("href");
          const selected = new URL(destination ?? "", origin);
          expect(decodeURIComponent(selected.pathname)).toBe(base);
          expect(selected.searchParams.get("item")).toBe(link.id);
          expect(selected.searchParams.get("s")).toBe(token);
          expect(selected.searchParams.get("cursor")).toBe(cursor);
          await sectionToggle.click();
          await browserExpect(row).not.toBeVisible();
          await browserExpect(
            sectionGroup.getByText("Context stays visible when this section is collapsed."),
          ).toBeVisible();
          await sectionToggle.click();
          if (js) await browserExpect(details).not.toBeVisible();
          else await browserExpect(details).toBeVisible();
          await browserExpect(
            page.getByRole("button", { name: /^(Expand|Collapse)$/ }),
          ).toHaveCount(0);
          if (js) await row.locator(".resource-meta").click();
          // Native exclusive disclosure groups keep exactly one item open.
          const another = page.locator(`.resource-row:not(#item-${link.id})`).first();
          await another.locator(".resource-meta").click();
          await browserExpect(details).not.toBeVisible();
          await browserExpect(page.locator(".resource-disclosure[open]")).toHaveCount(1);
          if (js)
            await browserExpect
              .poll(() => new URL(page.url()).searchParams.get("item"))
              .toBe((await another.getAttribute("id"))?.replace("item-", ""));
          await row.locator(".resource-meta").click();
          await browserExpect(another.locator(".item-context")).not.toBeVisible();
          await details.getByRole("link", { name: "Link to this item" }).click();
          await browserExpect(details).toBeVisible();
          await page.reload();
          await browserExpect(details).toBeVisible();
          await browserExpect(sectionGroup.locator("details.section-disclosure")).toHaveAttribute(
            "open",
            "",
          );
          await row.locator("summary").focus();
          await page.keyboard.press("Space");
          await browserExpect(details).not.toBeVisible();
          // A direct item URL still opens an item beyond the first page.
          await page.goto(`${origin}${base}?s=${token}&item=${link.id}`);
          await browserExpect(details).toBeVisible();
          if (js) {
            await browserExpect(row.locator("summary")).toBeInViewport();
            expect(new URL(page.url()).searchParams.get("item")).toBe(link.id);
          }
          await browserExpect(
            row.getByRole("link", { name: "A useful resource", exact: true }),
          ).toHaveAttribute("referrerpolicy", "no-referrer");
          for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: 800 });
            await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light" });
            await page.screenshot({
              path: `/tmp/item-details-${js}-${width}.png`,
              animations: "disabled",
            });
            expect(await details.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
          }
          if (js) {
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.goto(`${origin}${base}?s=${token}&item=${link.id}`);
            const chosen = page.locator(`.resource-row:not(#item-${link.id})`).first();
            const chosenRowId = await chosen.getAttribute("id");
            if (!chosenRowId) throw new Error("Selected item has no row ID");
            const chosenId = chosenRowId.replace("item-", "");
            await chosen.locator(".resource-meta").click();
            await page.getByRole("link", { name: "More resources", exact: true }).click();
            await browserExpect(page.locator(".linked-item")).toHaveCount(0);
            await browserExpect(chosen.locator(".item-context")).toBeVisible();
            await browserExpect(row.locator(".item-context")).not.toBeVisible();
            expect(new URL(page.url()).searchParams.get("item")).toBe(chosenId);
            const insidePageId = first.body.data[first.body.data.length - 1].id;
            await page.goto(`${origin}${base}?s=${token}&item=${insidePageId}`);
            const insidePage = page.locator(`#item-${insidePageId}`);
            await browserExpect(insidePage.locator(".item-context")).toBeVisible();
            // Wait for the header fold before judging the final scroll destination.
            await browserExpect(page.locator(".collection-heading")).toHaveAttribute(
              "data-folded",
              "true",
            );
            await browserExpect
              .poll(() =>
                insidePage.locator("summary").evaluate((element) => {
                  const body = element.closest(".sheet-body");
                  if (!body) return false;
                  const rect = element.getBoundingClientRect(),
                    area = body.getBoundingClientRect();
                  return (
                    rect.top >= Math.max(0, area.top) &&
                    rect.bottom <= Math.min(window.innerHeight, area.bottom)
                  );
                }),
              )
              .toBe(true);
          }
          await page.goto(`${origin}${base}?s=${token}&item=${crypto.randomUUID()}`);
          await browserExpect(
            page.getByRole("status").filter({ hasText: "Item unavailable" }),
          ).toBeVisible();
          await page.goto(`${origin}${base}?s=${token}&item=bad-id`);
          await browserExpect(
            page.getByRole("status").filter({ hasText: "Item unavailable" }),
          ).toBeVisible();
        }
        await request(app.getHttpServer())
          .put(`/api/v1/collections/${id}/link-sharing`)
          .auth(owner, { type: "bearer" })
          .send({ enabled: false })
          .expect(200);
        for (const base of [`/c/${id}`, `/@${handle}/${slug}`]) {
          const destination = `${base}?s=${token}&item=${link.id}`;
          await page.goto(origin + destination);
          await browserExpect(page.getByRole("dialog")).toHaveCount(0);
          await browserExpect(page.locator("body")).not.toContainText("A useful resource");
          const signIn = await page
            .locator(".feedback-actions")
            .getByRole("link", { name: "Sign in", exact: true })
            .getAttribute("href");
          expect(new URL(signIn ?? "", origin).searchParams.get("returnTo")).toBe(destination);
        }
      } finally {
        await close();
      }
    }, 60000);
  }
});

it("preserves private sharing destinations and resumes access, link and transfer forms after session expiry, with and without JavaScript", async () => {
  for (const js of [true, false]) {
    await prisma.requestBudget.deleteMany();
    const email = `resume-owner-${crypto.randomUUID()}@example.com`;
    const signed = await signInHubOwner(app.getHttpServer(), { email, name: "Resume owner" });
    const receiverEmail = `resume-receiver-${crypto.randomUUID()}@example.com`;
    const receiver = await signInWithCode(app.getHttpServer(), { email: receiverEmail });
    const id = (
      await request(app.getHttpServer())
        .post("/api/v1/collections")
        .auth(signed.headers["set-auth-token"], { type: "bearer" })
        .send({ title: "Resume sharing", slug: `resume-${crypto.randomUUID()}` })
        .expect(201)
    ).body.data.id as string;
    const path = `/share?${new URLSearchParams({ kind: "collection", id, returnTo: `/c/${id}` })}`;
    const { page, close } = await freshPage(js);
    const verify = async () => {
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: "Send code", exact: true }).click();
      await browserExpect(page.locator("h1")).toHaveText("Check your email");
      await page.getByLabel("Eight-digit code").fill(await capturedCode(email));
      await page.getByRole("button", { name: "Verify and continue" }).click();
    };
    const expire = async () => {
      await prisma.requestBudget.deleteMany();
      await prisma.session.updateMany({
        where: { user: { email } },
        data: { expiresAt: new Date(0) },
      });
    };
    try {
      await ready(page, path);
      const signIn = page.locator('main a[href^="/sign-in?"]');
      const destination = new URL(
        (await signIn.getAttribute("href")) ?? "",
        origin,
      ).searchParams.get("returnTo");
      expect(destination).toBe(path);
      await signIn.click();
      await verify();
      await browserExpect(page.locator("h1")).toHaveText("Share collection");
      await browserExpect(
        page.getByRole("link", { name: "Back to collection", exact: true }),
      ).toHaveAttribute("href", `/c/${id}`);

      await page.getByLabel("Email", { exact: true }).fill(receiverEmail);
      await page.locator('select[name="role"]').selectOption("contributor");
      await expire();
      await page.getByRole("button", { name: "Grant access", exact: true }).click();
      await browserExpect(page.locator(".verify-reason")).toContainText(
        "grant access to this collection",
      );
      await verify();
      await browserExpect(page.locator("h1")).toHaveText("Share collection");
      expect(
        await prisma.collectionShare.findFirst({
          where: { collectionId: id, userId: receiver.body.user.id },
        }),
      ).toMatchObject({ role: "contributor" });

      let previousToken: string | null = null;
      for (const label of ["Create share link", "Replace share link", "Turn off link access"]) {
        await expire();
        await page.getByRole("button", { name: label, exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Sign in to continue");
        await verify();
        await browserExpect(page.locator("h1")).toHaveText("Share collection");
        const link = new URL(
          await page.getByLabel("Collection link", { exact: true }).inputValue(),
        );
        if (label === "Turn off link access") {
          expect(link.searchParams.get("s")).toBeNull();
          await request(app.getHttpServer())
            .get(`/api/v1/collections/${id}`)
            .set("x-share-token", previousToken ?? "")
            .expect(404);
        } else {
          const token = link.searchParams.get("s");
          expect(token).toBeTruthy();
          expect(token).not.toBe(previousToken);
          await request(app.getHttpServer())
            .get(`/api/v1/collections/${id}`)
            .set("x-share-token", token ?? "")
            .expect(200);
          if (previousToken)
            await request(app.getHttpServer())
              .get(`/api/v1/collections/${id}`)
              .set("x-share-token", previousToken)
              .expect(404);
          previousToken = token;
        }
        expect(
          (await page.context().cookies()).some((cookie) => cookie.name === "pending_action"),
        ).toBe(false);
      }

      await ready(page, `/c/${id}/actions?action=transfer`);
      await page.getByLabel("New owner's email").fill(receiverEmail);
      await expire();
      await page.getByRole("button", { name: "Transfer ownership", exact: true }).click();
      await browserExpect(page.locator(".verify-reason")).toContainText("transfer this collection");
      await verify();
      await browserExpect(page).toHaveURL(`${origin}/manage/collections?notice=done`);
      const transferred = await prisma.collection.findUniqueOrThrow({
        where: { id },
        include: { hub: true },
      });
      expect(transferred.hub.ownerUserId).toBe(receiver.body.user.id);
    } finally {
      await close();
    }
  }
}, 120000);

it("binds resumed collection commands to their account and rechecks current authority", async () => {
  for (const js of [true, false]) {
    for (const switchAccount of [true, false]) {
      await prisma.requestBudget.deleteMany();
      const email = `pending-owner-${crypto.randomUUID()}@example.com`;
      const nextEmail = `pending-next-${crypto.randomUUID()}@example.com`;
      const next = await signInHubOwner(app.getHttpServer(), { email: nextEmail });
      const { page, close } = await freshPage(js);
      try {
        await browserSignIn(page, email, "/settings");
        await browserExpect(page.locator("h1")).toHaveText("Settings");
        const person = await prisma.user.findUniqueOrThrow({ where: { email } });
        const hub = await prisma.withAuthority(() => ensurePersonalHub(prisma, person.id));
        const collection = await prisma.collection.create({
          data: {
            hubId: hub.id,
            title: "Pending authority",
            slug: `pending-${crypto.randomUUID()}`,
          },
        });
        await ready(page, `/c/${collection.id}/actions?action=delete`);
        await prisma.session.updateMany({
          where: { userId: person.id },
          data: { expiresAt: new Date(0) },
        });
        await page.getByRole("button", { name: "Delete collection", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Sign in to continue");
        // Ownership changes while the command is waiting. The new owner could
        // delete it, but must never inherit the previous account's pending action.
        const nextHub = await prisma.hub.findUniqueOrThrow({
          where: { ownerUserId: next.body.user.id },
        });
        await prisma.collection.update({
          where: { id: collection.id },
          data: { hubId: nextHub.id },
        });
        const verifyingEmail = switchAccount ? nextEmail : email;
        await page.getByLabel("Email address").fill(verifyingEmail);
        await page.getByRole("button", { name: "Send code", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Check your email");
        await page.getByLabel("Eight-digit code").fill(await capturedCode(verifyingEmail));
        await page.getByRole("button", { name: "Verify and continue" }).click();
        await browserExpect(page).toHaveURL(/\/manage\/collections(?:\?|$)/);
        expect(await prisma.collection.count({ where: { id: collection.id } })).toBe(1);
        expect(
          (await page.context().cookies()).some((cookie) => cookie.name === "pending_action"),
        ).toBe(false);
        if (switchAccount) expect(new URL(page.url()).searchParams.has("notice")).toBe(false);
        else expect(new URL(page.url()).searchParams.get("notice")).not.toBe("done");
      } finally {
        await close();
      }
    }
  }
}, 90000);

it("offers checked shorter usernames without replacing a draft until chosen", async () => {
  const { page, close } = await freshPage();
  let release = () => {};
  try {
    const email = `short-name-${crypto.randomUUID()}@example.com`;
    await browserSignIn(page, email, "/settings");
    await browserExpect(page.locator("h1")).toHaveText("Settings");
    const before = await prisma.user.findUniqueOrThrow({ where: { email } });
    const input = page.getByLabel("Username", { exact: true });
    await browserExpect(input).toHaveAttribute("maxlength", "255");
    const long = "somethingverylongwhatwillyoudoaboutthat";
    await input.fill(long);
    const choice = page.getByRole("button", { name: /^Use / });
    await browserExpect(choice).toHaveText(/^Use somethingverylo-[a-z0-9]{4}$/);
    const first = (await choice.innerText()).slice(4);
    await browserExpect(input).toHaveValue(long);
    await browserExpect(page.locator("#username-status")).toContainText("3–20");
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).username).toBe(
      before.username,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: "/tmp/username-suggestion-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({
      path: "/tmp/username-suggestion-desktop.png",
      fullPage: true,
      animations: "disabled",
    });

    // Checking is not reserving: a competing claim must still block acceptance.
    await prisma.user.create({
      data: {
        name: "Competing claim",
        email: `claim-${crypto.randomUUID()}@example.com`,
        username: first.replaceAll("-", ""),
      },
    });
    await choice.click();
    await browserExpect(page.locator("#username-status")).toContainText("already in use");
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).username).toBe(
      before.username,
    );
    await input.fill(long);
    await browserExpect(choice).toHaveText(/^Use somethingverylo-[a-z0-9]{4}$/);
    await browserExpect(choice).not.toHaveText(`Use ${first}`);
    const suggested = (await choice.innerText()).slice(4);
    expect(suggested.length).toBeLessThanOrEqual(20);
    await choice.click();
    await browserExpect(input).toBeFocused();
    await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).username).toBe(suggested);

    let started = () => {};
    const checking = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const stale = "anotherverylongusernametocheck";
    const route = `**/api/v1/profile/username-availability?username=${stale}`;
    await page.route(route, async (request) => {
      started();
      await held;
      await request.fulfill({
        json: { data: { username: stale, status: "invalid", suggestion: "stale-name-a7k2" } },
      });
    });
    await input.fill(stale);
    await checking;
    await input.fill("share");
    await browserExpect(page.locator("#username-status")).toContainText("reserved");
    release();
    await browserExpect(choice).toHaveCount(0);
    await browserExpect(input).toHaveValue("share");
    await page.unroute(route);
    await page.route("**/api/v1/profile/username-availability?*", (request) => request.abort());
    await input.fill(long);
    await browserExpect(page.locator("#username-status")).toContainText("couldn't");
    await browserExpect(input).toHaveValue(long);
    await browserExpect(choice).toHaveCount(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).username).toBe(suggested);
  } finally {
    release();
    await close();
  }
}, 30000);

it("adopts a hub created in another tab during a profile save while preserving newer edits", async () => {
  for (const newerEdit of [false, true]) {
    await prisma.requestBudget.deleteMany();
    const email = `hub-settings-sync-${crypto.randomUUID()}@example.com`;
    const { page, close } = await freshPage();
    let release = () => {};
    try {
      await browserSignIn(page, email, "/settings");
      const name = page.getByLabel("Full name", { exact: true });
      await browserExpect(name).toBeVisible();
      await browserExpect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toHaveCount(0);
      let started = () => {};
      const waiting = new Promise<void>((resolve) => {
        started = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/forms/profile-save", async (route) => {
        started();
        await held;
        await route.continue();
      });
      await name.fill("Earlier profile name");
      await waiting;
      const otherTab = await page.context().newPage();
      await ready(otherTab, "/hub");
      await otherTab.getByRole("button", { name: "Create hub", exact: true }).click();
      await browserExpect(otherTab).toHaveURL(/\/h\/[a-f0-9-]+$/);
      const person = await prisma.user.findUniqueOrThrow({ where: { email } });
      const hub = await prisma.hub.update({
        where: { ownerUserId: person.id },
        data: {
          name: "Newly created hub",
          handle: `sync-${crypto.randomUUID().slice(0, 8)}`,
          description: "Created in another tab",
          showOwner: false,
        },
      });
      await otherTab.close();
      if (newerEdit) await name.fill("Newer profile name");
      release();
      await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
      await browserExpect(name).toHaveValue(
        newerEdit ? "Newer profile name" : "Earlier profile name",
      );
      await settingsSection(page, "Hub");
      await browserExpect(page.getByLabel("Hub name", { exact: true })).toHaveValue(hub.name);
      await browserExpect(page.getByLabel("Handle", { exact: true })).toHaveValue(hub.handle);
      await browserExpect(page.getByLabel("Description", { exact: true })).toHaveValue(
        hub.description ?? "",
      );
      await browserExpect(
        page.getByRole("switch", { name: "Show owner", exact: true }),
      ).not.toBeChecked();
      await browserExpect(page.locator(".hub-id")).toHaveText(hub.id);
      await page.getByLabel("Hub name", { exact: true }).fill("Updated after mounting");
      await browserExpect(page.locator(".profile-save-status.success")).toContainText("Saved");
      const updated = await prisma.hub.findUniqueOrThrow({ where: { id: hub.id } });
      expect(updated.name).toBe("Updated after mounting");
      expect(updated.handle).toBe(hub.handle);
      expect(updated.description).toBe(hub.description);
      expect(updated.showOwner).toBe(false);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).name).toBe(
        newerEdit ? "Newer profile name" : "Earlier profile name",
      );
    } finally {
      release();
      await close();
    }
  }
}, 60000);

it("tracks copies and opens of newly created and repeatedly rotated collection links", async () => {
  await prisma.requestBudget.deleteMany();
  const email = `issued-copy-${crypto.randomUUID()}@example.com`;
  const signed = await signInWithCode(app.getHttpServer(), { email, name: "Link owner" });
  const created = await request(app.getHttpServer())
    .post("/api/v1/collections")
    .auth(signed.headers["set-auth-token"], { type: "bearer" })
    .send({ title: "Issued link guide", slug: `issued-${crypto.randomUUID()}` })
    .expect(201);
  const id = created.body.data.id as string;
  const { page, close } = await freshPage();
  const recipient = await freshPage();
  try {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    const path = `/share?kind=collection&id=${id}&returnTo=${encodeURIComponent(`/c/${id}`)}`;
    await browserSignIn(page, email, path);
    let previousToken: string | null = null;
    let previousUrl = "";
    for (let i = 0; i < 3; i++) {
      if (i === 1) await ready(page, path);
      await page
        .getByRole("button", {
          name: i === 0 ? "Create share link" : "Replace share link",
          exact: true,
        })
        .click();
      const field = page.getByLabel("Collection link", { exact: true }).last();
      await browserExpect(field).toHaveValue(/\?s=/);
      await browserExpect(field).not.toHaveValue(previousUrl);
      const issued = new URL(await field.inputValue());
      expect(issued.searchParams.get("s")).toBeTruthy();
      expect(issued.searchParams.get("s")).not.toBe(previousToken);
      expect(issued.searchParams.has("via")).toBe(false);
      const copy = page.getByRole("button", { name: "Copy link", exact: true }).last();
      await copy.click();
      await browserExpect(field).toHaveValue(/via=/);
      const tracked = await field.inputValue();
      await browserExpect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(tracked);
      const url = new URL(tracked);
      expect(url.searchParams.get("s")).toBe(issued.searchParams.get("s"));
      const shareId = url.searchParams.get("via") as string;
      const entry = await prisma.shareEntry.findUniqueOrThrow({ where: { id: shareId } });
      expect(entry.resourceId).toBe(id);
      expect(entry.createdByUserId).toBe(signed.body.user.id);
      expect(entry.context).toEqual({ destination: "copy_link" });
      await copy.click();
      expect(await prisma.shareEntry.count({ where: { resourceId: id } })).toBe(i + 1);
      await recipient.page.goto(tracked);
      await browserExpect(recipient.page.locator("h1")).toHaveText("Issued link guide");
      await browserExpect
        .poll(
          async () =>
            (await prisma.shareEntry.findUniqueOrThrow({ where: { id: shareId } })).openCount,
        )
        .toBe(1);
      previousToken = issued.searchParams.get("s");
      previousUrl = tracked;
    }
  } finally {
    await close();
    await recipient.close();
  }
}, 60000);

describe("section authoring", () => {
  for (const js of [true, false]) {
    it(`creates sections, edits context and retains native disclosure behavior (${js})`, async () => {
      const signed = await signInHubOwner(app.getHttpServer(), {
        email: `section-author-${crypto.randomUUID()}@example.com`,
        name: "Section author",
      });
      const token = signed.headers["set-auth-token"] as string;
      const id = (
        await request(app.getHttpServer())
          .post("/api/v1/collections")
          .auth(token, { type: "bearer" })
          .send({ title: "A practical guide", slug: `sections-${crypto.randomUUID()}` })
          .expect(201)
      ).body.data.id as string;
      await prisma.resource.createMany({
        data: Array.from({ length: 24 }, (_, position) => ({
          collectionId: id,
          kind: "external_link",
          url: `https://fixture-links.dev/guide-${position}`,
          position,
        })),
      });
      const first = await prisma.resource.findFirstOrThrow({
        where: { collectionId: id },
        orderBy: { position: "asc" },
      });
      const { page, close } = await freshPage(js);
      try {
        for (const raw of signed.headers["set-cookie"] as unknown as string[]) {
          const [name, ...value] = raw.split(";")[0].split("=");
          await page.context().addCookies([{ name, value: value.join("="), url: origin }]);
        }
        await ready(page, `/c/${id}/sections`);
        await page.getByLabel("Section heading", { exact: true }).fill("Start here");
        await page
          .getByLabel("Section description (optional)")
          .fill("Read the introduction.\nThen choose a reference.");
        await page.getByLabel("Start section at").selectOption(`${first.id}:1`);
        // Simulate a change in another client while preserving the typed draft.
        await request(app.getHttpServer())
          .patch(`/api/v1/collections/${id}/resources/${first.id}`)
          .auth(token, { type: "bearer" })
          .send({ version: 1, tags: ["start"] })
          .expect(200);
        await page.getByRole("button", { name: "Create section", exact: true }).click();
        await browserExpect(page.locator("main").getByRole("alert")).toContainText(
          "changed elsewhere",
        );
        await browserExpect(page.getByLabel("Section heading", { exact: true })).toHaveValue(
          "Start here",
        );
        await browserExpect(page.getByLabel("Section description (optional)")).toHaveValue(
          "Read the introduction.\nThen choose a reference.",
        );
        await page.getByRole("button", { name: "Create section", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("A practical guide");
        const group = page.locator(".resource-section");
        const description = group.locator(".section-description");
        const row = page.locator(`#item-${first.id}`);
        await browserExpect(description).toHaveText(
          "Read the introduction.\nThen choose a reference.",
        );
        await group.locator("summary").first().click();
        await browserExpect(row).not.toBeVisible();
        await browserExpect(description).toBeVisible();
        if (js) {
          await page.getByRole("link", { name: "More resources", exact: true }).click();
          await browserExpect(page.locator(".resource-row")).toHaveCount(24);
          await browserExpect(group).toHaveCount(1);
          await browserExpect(row).not.toBeVisible();
          await group.locator("summary").first().click();
          await browserExpect(row).toBeVisible();
          await browserExpect(row.locator(".item-context")).not.toBeVisible();
        } else {
          await page.getByRole("link", { name: "More resources", exact: true }).click();
          await browserExpect(page.locator(".resource-section")).toHaveCount(1);
          await browserExpect(page.locator(".section-description")).toBeVisible();
        }
        await page
          .locator(".collection-actions")
          .getByRole("link", { name: "Edit", exact: true })
          .click();
        await page.getByRole("link", { name: "Edit section description", exact: true }).click();
        await browserExpect(page.getByLabel("Section description (optional)")).toHaveAttribute(
          "maxlength",
          "500",
        );
        await page
          .getByLabel("Section description (optional)")
          .fill("Updated context for this guide.");
        await page.getByRole("button", { name: "Save description", exact: true }).click();
        await browserExpect(page.locator(".section-description")).toHaveText(
          "Updated context for this guide.",
        );
        await browserExpect(page.getByRole("dialog")).toHaveCount(0);
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 800 });
          await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light" });
          await page.screenshot({
            path: `/tmp/sections-${js}-${width}.png`,
            animations: "disabled",
          });
          expect(
            await page.locator("body").evaluate((el) => el.scrollWidth <= window.innerWidth),
          ).toBe(true);
        }
      } finally {
        await close();
      }
    }, 60000);
  }
});

describe("reorder", () => {
  for (const js of [true, false]) {
    it(`moves items with native controls and preserves expired-session commands (${js})`, async () => {
      await prisma.requestBudget.deleteMany();
      const email = `reorder-${crypto.randomUUID()}@example.com`;
      const signed = await signInHubOwner(app.getHttpServer(), { email, name: "Reorder author" });
      const token = signed.headers["set-auth-token"] as string;
      const id = (
        await request(app.getHttpServer())
          .post("/api/v1/collections")
          .auth(token, { type: "bearer" })
          .send({ title: "Ordered guide", slug: `order-${crypto.randomUUID()}`, published: true })
          .expect(201)
      ).body.data.id as string;
      await prisma.resource.createMany({
        data: Array.from({ length: 22 }, (_, position) => ({
          collectionId: id,
          kind: "external_link",
          url: `https://fixture-links.dev/ordered-${position}`,
          position,
        })),
      });
      const rows = () =>
        prisma.resource.findMany({ where: { collectionId: id }, orderBy: { position: "asc" } });
      const original = await rows();
      const { page, close } = await freshPage(js);
      try {
        await ready(page, `/c/${id}`);
        await browserExpect(page.getByRole("link", { name: "Reorder", exact: true })).toHaveCount(
          0,
        );
        await browserExpect(
          page.locator(".collection-actions").getByRole("link", { name: "Edit", exact: true }),
        ).toHaveCount(0);
        await browserSignIn(page, email, `/c/${id}`);
        await browserExpect(page.locator(".collection-actions > a")).toHaveCount(2);
        await browserExpect(page.getByRole("link", { name: "Reorder", exact: true })).toHaveCount(
          0,
        );
        await browserExpect(
          page.getByRole("link", { name: "Add section", exact: true }),
        ).toHaveCount(0);
        await page
          .locator(".collection-actions")
          .getByRole("link", { name: "Edit", exact: true })
          .click();
        await browserExpect(page.getByLabel("Collection name", { exact: true })).toBeVisible();
        await browserExpect(
          page.getByRole("link", { name: "Add a link", exact: true }),
        ).toBeVisible();
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 800 });
          await page.screenshot({
            path: `/tmp/collection-edit-${js}-${width}.png`,
            fullPage: true,
          });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.getByRole("link", { name: "Reorder", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Reorder items");
        await page
          .locator(`#reorder-${original[1].id}`)
          .getByRole("button", { name: "Move up", exact: true })
          .click();
        await browserExpect(page.getByRole("status")).toHaveText("Order saved.");
        expect((await rows()).slice(0, 3).map((row) => row.id)).toEqual([
          original[1].id,
          original[0].id,
          original[2].id,
        ]);
        if (js) {
          await browserExpect(
            page.locator(`#reorder-${original[2].id} .reorder-title`),
          ).toHaveAttribute("draggable", "true");
          await page.evaluate(() => window.scrollTo(0, 0));
          await page
            .locator(`#reorder-${original[2].id} .reorder-title`)
            .dragTo(page.locator(`#reorder-${original[1].id}`));
          await browserExpect.poll(async () => (await rows())[0].id).toBe(original[2].id);
          await browserExpect(page.locator(".reorder-list > li").first()).toHaveAttribute(
            "id",
            `reorder-${original[2].id}`,
          );
        }
        // Native moves can cross the visible page boundary without a partial reorder payload.
        await page.getByRole("link", { name: "More items", exact: true }).click();
        const boundary = (await rows())[20];
        await page
          .locator(`#reorder-${boundary.id}`)
          .getByRole("button", { name: "Move up", exact: true })
          .click();
        await browserExpect(page.getByRole("status")).toHaveText("Order saved.");
        expect((await rows())[19].id).toBe(boundary.id);
        await page.getByRole("link", { name: "First items", exact: true }).click();
        const current = await rows();
        await prisma.session.updateMany({
          where: { user: { email } },
          data: { expiresAt: new Date(0) },
        });
        await page
          .locator(`#reorder-${current[1].id}`)
          .getByRole("button", { name: "Move up", exact: true })
          .click();
        await browserExpect(page.locator(".verify-reason")).toContainText("move this item");
        await page.getByLabel("Email address").fill(email);
        await page.getByRole("button", { name: "Send code", exact: true }).click();
        await browserExpect(page.locator("h1")).toHaveText("Check your email");
        await page.getByLabel("Eight-digit code").fill(await capturedCode(email));
        await page.getByRole("button", { name: "Verify and continue" }).click();
        await browserExpect(page.locator("h1")).toHaveText("Reorder items");
        expect((await rows())[0].id).toBe(current[1].id);
        // A stale form reports the conflict; it never silently reapplies the move.
        const stale = (await rows())[1];
        await prisma.resource.update({
          where: { id: stale.id },
          data: { version: { increment: 1 } },
        });
        await page
          .locator(`#reorder-${stale.id}`)
          .getByRole("button", { name: "Move up", exact: true })
          .click();
        await browserExpect(page.locator("main").getByRole("alert")).toContainText(
          "changed elsewhere",
        );
        expect((await rows())[1].id).toBe(stale.id);
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 800 });
          await page.screenshot({ path: `/tmp/reorder-${js}-${width}.png` });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          ).toBe(true);
        }
      } finally {
        await close();
      }
    }, 60000);
  }
});

it("claims a permanent hub handle and deactivates/reactivates through native account forms", async () => {
  for (const js of [true, false]) {
    await prisma.requestBudget.deleteMany();
    const email = `self-service-browser-${crypto.randomUUID()}@example.com`;
    const { page, close } = await freshPage(js);
    try {
      await browserOwnerSettings(page, email);
      await settingsSection(page, "Hub");
      const chosen = `permanent-${crypto.randomUUID().slice(0, 8)}`;
      await page.getByLabel("Handle", { exact: true }).fill(chosen);
      if (js) await browserExpect(page.locator("#handle-status")).toHaveText("Available");
      await page.getByLabel("I choose this permanent hub handle.").check();
      if (js)
        for (const width of [390, 768, 1280, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({ path: `/tmp/handle-claim-${width}.png`, fullPage: true });
        }
      await page.getByRole("button", { name: "Claim handle", exact: true }).click();
      await browserExpect(page.getByLabel("Handle", { exact: true })).toHaveAttribute(
        "readonly",
        "",
      );
      await ready(page, "/account?action=deactivate");
      if (js)
        for (const width of [390, 768, 1280, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.screenshot({ path: `/tmp/account-deactivate-${width}.png`, fullPage: true });
        }
      await page.getByRole("button", { name: "Send confirmation code" }).click();
      await page.getByLabel("Verification code").fill("00000000");
      await page.getByRole("button", { name: "Confirm: deactivate account" }).click();
      await browserExpect(page.getByRole("alert")).toContainText("incorrect");
      await page.getByLabel("Verification code").fill(await capturedCode(email));
      await page.getByRole("button", { name: "Confirm: deactivate account" }).click();
      await browserExpect(page.getByRole("status")).toContainText("deactivated");
      const person = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(person.accountState).toBe("inactive");
      // Advance only this fixture's resend gap.
      await prisma.$executeRaw`UPDATE request_budgets SET expires_at = clock_timestamp() WHERE key = ${emailKey(emailConfig().secret, "issue-gap", email)}`;
      await page.getByRole("link", { name: "Reactivate account", exact: true }).click();
      await page.getByLabel("Account email").fill(email);
      await page.getByRole("button", { name: "Send confirmation code" }).click();
      await page.getByLabel("Verification code").fill(await capturedCode(email));
      await page.getByRole("button", { name: "Confirm: reactivate account" }).click();
      await browserExpect(page.getByRole("status")).toContainText("active again");
      expect((await prisma.user.findUniqueOrThrow({ where: { email } })).accountState).toBe(
        "active",
      );
      expect(await prisma.session.count({ where: { userId: person.id } })).toBe(0);
    } finally {
      await close();
    }
  }
}, 60000);

it("rejects an account confirmation replaced by another tab", async () => {
  await prisma.requestBudget.deleteMany();
  const email = `account-tabs-${crypto.randomUUID()}@example.com`;
  const { page, close } = await freshPage();
  try {
    await browserOwnerSettings(page, email);
    await ready(page, "/account?action=deactivate");
    await page.getByRole("button", { name: "Send confirmation code" }).click();
    await browserExpect(page.getByLabel("Verification code")).toBeVisible();
    await prisma.$executeRaw`UPDATE request_budgets SET expires_at = clock_timestamp() WHERE key = ${emailKey(emailConfig().secret, "issue-gap", email)}`;
    const otherTab = await page.context().newPage();
    await ready(otherTab, "/account?action=delete");
    await otherTab.getByRole("button", { name: "Send confirmation code" }).click();
    await browserExpect(otherTab.getByLabel("Verification code")).toBeVisible();
    // Even a valid code from the newest email must not change the older form's action.
    await page.getByLabel("Verification code").fill(await capturedCode(email));
    await page.getByRole("button", { name: "Confirm: deactivate account" }).click();
    await browserExpect(page.getByRole("alert")).toContainText("expired");
    const account = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(account.accountState).toBe("active");
    expect(account.deletionScheduledFor).toBeNull();
  } finally {
    await close();
  }
}, 30000);
