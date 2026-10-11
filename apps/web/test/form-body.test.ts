import { expect, it } from "bun:test";
import { readFormData } from "../src/lib/form-body";

const origin = "https://example.com";
function request(body: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/forms/import-row`, {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
}
it("accepts maximum Unicode import tags and placement without losing encoded text", async () => {
  const fields = new URLSearchParams({
    tags: Array.from({ length: 30 }, (_, i) => `${i}`.padEnd(80, "界")).join("\n"),
    address: `https://example.com/${"a".repeat(2000)}`,
    collectionTitle: "藏".repeat(255),
    sectionTitle: "節".repeat(255),
    id: crypto.randomUUID(),
    rowId: crypto.randomUUID(),
    version: "1",
  });
  expect(Buffer.byteLength(fields.toString())).toBeGreaterThan(21000);
  expect(await readFormData(request(fields.toString()), origin, "import-row")).toEqual(fields);
  await expect(readFormData(request(fields.toString()), origin, "profile")).rejects.toThrow("size");
  await expect(readFormData(request(fields.toString()), origin, "import-unknown")).rejects.toThrow(
    "size",
  );
});
it("keeps both form allowances bounded even when Content-Length understates the body", async () => {
  for (const [action, limit] of [
    ["import-row", 65536],
    ["profile", 16384],
  ] as const) {
    expect(
      (await readFormData(request(`a=${"x".repeat(limit - 2)}`), origin, action)).get("a")?.length,
    ).toBe(limit - 2);
    await expect(
      readFormData(request(`a=${"x".repeat(limit)}`, { "content-length": "1" }), origin, action),
    ).rejects.toThrow("size");
  }
});
it("retains origin and encoding checks for import edits", async () => {
  for (const headers of [
    { origin: "https://elsewhere.example" },
    { "sec-fetch-site": "cross-site" },
    { "content-type": "application/json" },
  ])
    await expect(
      readFormData(
        request("a=b", Object.fromEntries(Object.entries(headers))),
        origin,
        "import-row",
      ),
    ).rejects.toThrow();
});
