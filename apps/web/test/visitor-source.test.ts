import { expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { sourceAttribution } from "../server/source";
import { visitorHeaders } from "../src/lib/visitor-source";

const secret = "synthetic-source-secret";
function incoming(source: string, issued = Date.now()) {
  const request = { socket: { remoteAddress: source }, headers: {} } as IncomingMessage;
  return new Headers(
    Object.fromEntries(
      (["read", "form"] as const).map((purpose) => [
        `x-web-${purpose}-source`,
        sourceAttribution(secret, [], purpose)(request, issued),
      ]),
    ),
  );
}
it("requires authenticated server-stamped read and form context before forwarding", () => {
  for (const supplied of [new Headers(), incoming("192.0.2.1")]) {
    supplied.delete("x-web-read-source");
    expect(() => visitorHeaders(supplied, {}, secret)).toThrow("source attribution is missing");
  }
  const onlyRead = incoming("192.0.2.1");
  onlyRead.delete("x-web-form-source");
  expect(() => visitorHeaders(onlyRead, {}, secret)).toThrow("source attribution is missing");
  for (const value of [
    "forged",
    incoming("192.0.2.1").get("x-web-read-source") ?? "",
    "x".repeat(513),
  ]) {
    const headers = incoming("192.0.2.1");
    headers.set("x-web-form-source", value);
    expect(() => visitorHeaders(headers, {}, secret)).toThrow();
  }
  expect(() => visitorHeaders(incoming("192.0.2.1"), {}, "wrong-secret")).toThrow();
});
it("renews expired ingress proofs for interleaved visitors at forwarding time", async () => {
  const started = Date.now();
  const results = await Promise.all(
    ["192.0.2.1", "192.0.2.2"].map(async (source) => {
      const context = incoming(source, started - 60_000);
      await Promise.resolve();
      return visitorHeaders(
        context,
        {
          "x-web-form-source": "wrong",
          Cookie: "session=example",
          "x-action-recovery": "service-proof",
        },
        secret,
      );
    }),
  );
  for (const [i, source] of ["192.0.2.1", "192.0.2.2"].entries()) {
    for (const purpose of ["read", "form"]) {
      const [payload, signature] = (results[i].get(`x-web-${purpose}-source`) ?? "").split(".");
      const [version, address, issued] = JSON.parse(Buffer.from(payload, "base64url").toString());
      expect([version, address]).toEqual([1, source]);
      expect(issued).toBeGreaterThanOrEqual(started);
      expect(issued).toBeLessThanOrEqual(Date.now());
      expect(signature).toBe(
        createHmac("sha256", secret).update(`web-${purpose}-source:${payload}`).digest("base64url"),
      );
    }
    expect(results[i].get("cookie")).toBe("session=example");
    expect(results[i].get("x-action-recovery")).toBe("service-proof");
  }
});
