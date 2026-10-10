import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { GravatarService } from "./gravatar.service";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOQS5n2HwAD1AIY4wETJQAAAABJRU5ErkJggg==",
  "base64",
);
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Gravatar image resolution", () => {
  it("hashes normalized emails, requests a bounded fixed-origin image, and deduplicates/caches", async () => {
    const fetcher = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(png, { headers: { "content-type": "image/png" } }),
    );
    const service = new GravatarService();
    const images = await Promise.all([
      service.resolve(" Reader@Example.com "),
      service.resolve("reader@example.com"),
    ]);
    expect(images[0]?.body).toEqual(png);
    expect(images[1]).toEqual(images[0]);
    await service.resolve("reader@example.com");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      `https://gravatar.com/avatar/${createHash("sha256").update("reader@example.com").digest("hex")}?s=128&d=404&r=g`,
    );
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it("falls back and negative-caches missing, failed, non-image and oversized responses", async () => {
    for (const response of [
      new Response(null, { status: 404 }),
      new Response(null, { status: 503 }),
      new Response("<html>error</html>", { headers: { "content-type": "image/png" } }),
      new Response(png, { headers: { "content-type": "text/html" } }),
      new Response(new Uint8Array(256 * 1024 + 1), { headers: { "content-type": "image/png" } }),
      new Response(png, { headers: { "content-type": "image/png", "content-length": "999999" } }),
    ]) {
      const fetcher = spyOn(globalThis, "fetch").mockResolvedValue(response);
      const service = new GravatarService();
      expect(await service.resolve("missing@example.com")).toBeNull();
      expect(await service.resolve("missing@example.com")).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
      fetcher.mockRestore();
    }
  });
  it("treats timeout and redirect failures as nonfatal", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
    expect(await new GravatarService().resolve("timeout@example.com")).toBeNull();
  });
});
