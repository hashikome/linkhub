import { describe, expect, it } from "bun:test";
import { shortIds } from "../src/lib/short-id";

describe("audit UUID display", () => {
  it("keeps the final segment even when it repeats, with distinct full-ID references", () => {
    const a = "019abcde-0123-7000-8000-bec0437d9c3d";
    const b = "019abcde-0124-7000-8000-bec0437d9c3d";
    const labels = shortIds([a, a, b]);
    expect(labels.get(a)).toBe("bec0437d9c3d");
    expect(labels.get(b)).toBe("bec0437d9c3d");
    expect(labels.size).toBe(2);
  });
});
