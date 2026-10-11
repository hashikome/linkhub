import { expect, it } from "bun:test";
import express from "express";
import request from "supertest";
import { browserBoundary } from "./browser-boundary";
import { browserCors } from "./browser-cors";

it("allows only the configured credentialed browser and keeps cookie CSRF checks", async () => {
  const webOrigin = "http://localhost:3004";
  const app = express();
  let calls = 0;
  app.use(browserCors(webOrigin), browserBoundary(webOrigin));
  app.all("/api/v1/proof", (_req, res) => {
    calls++;
    res.json({ data: true });
  });
  const preflight = () =>
    request(app)
      .options("/api/v1/proof")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
  const allowed = await preflight().set("Origin", webOrigin).expect(204);
  expect(allowed.headers["access-control-allow-origin"]).toBe(webOrigin);
  expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
  expect(calls).toBe(0);
  for (const origin of [
    "null",
    "https://evil.test",
    "http://localhost:4004",
    "http://localhost:30001",
  ]) {
    const denied = await preflight().set("Origin", origin).expect(403);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await request(app)
      .post("/api/v1/proof")
      .set("Origin", origin)
      .set("Cookie", "better-auth.session_token=fixture")
      .expect(403);
  }
  await preflight()
    .set("Origin", webOrigin)
    .set("Access-Control-Request-Headers", "x-web-form-source")
    .expect(403);
  await request(app)
    .post("/api/v1/proof")
    .set("Cookie", "better-auth.session_token=fixture")
    .expect(403);
  const read = await request(app).get("/api/v1/proof").set("Origin", webOrigin).expect(200);
  expect(read.headers["access-control-expose-headers"]).toContain("retry-after");
  await request(app)
    .post("/api/v1/proof")
    .set("Origin", webOrigin)
    .set("Cookie", "better-auth.session_token=fixture")
    .expect(200);
  await request(app).post("/api/v1/proof").set("Authorization", "Bearer fixture").expect(200);
  expect(calls).toBe(3);
});
