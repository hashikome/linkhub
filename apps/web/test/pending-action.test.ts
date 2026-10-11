import { describe, expect, it } from "bun:test";
import {
  openPendingAction,
  type PendingAction,
  sealPendingAction,
} from "../src/lib/pending-action-codec";

const secret = "synthetic-action-secret-with-32-characters";
const action: PendingAction = {
  path: "/api/v1/imports/019a0000-0000-7000-8000-000000000001/rows/019a0000-0000-7000-8000-000000000002",
  method: "PATCH",
  body: {
    version: 2,
    address: `https://fixture-links.dev/${"a".repeat(1800)}`,
    tags: Array.from({ length: 15 }, (_, i) => `tag-${i}-${"é".repeat(60)}`),
  },
  target: "/manage/import-export/019a0000-0000-7000-8000-000000000001?status=failed",
  owner: "account-fingerprint",
  label: "save your import changes",
  issued: Date.now(),
};
function storage() {
  const records = new Map<string, string>();
  return {
    records,
    put: async (token: string, payload: string) => {
      records.set(token, payload);
    },
    get: async (token: string) => records.get(token) ?? null,
  };
}
describe("pending action recovery", () => {
  it("round-trips oversized UTF-8 edits through an opaque reference without losing fields", async () => {
    const store = storage();
    const cookie = await sealPendingAction(action, secret, store);
    expect(cookie).toMatch(/^ref\.[a-f0-9]{64}$/);
    expect(cookie.length).toBeLessThan(3800);
    expect(store.records.size).toBe(1);
    expect([...store.records.values()][0]).not.toContain("fixture-links");
    expect(await openPendingAction(cookie, secret, store)).toEqual(action);
    expect(await openPendingAction(cookie, "another secret", store)).toBeNull();
    expect(await openPendingAction(cookie, secret, store, action.issued + 900_001)).toBeNull();
    store.records.clear();
    expect(await openPendingAction(cookie, secret, store)).toBeNull();
  });
  it("keeps small actions self-contained and rejects tampering", async () => {
    const store = storage(),
      small = { ...action, body: { version: 1 } };
    const cookie = await sealPendingAction(small, secret, store);
    expect(store.records.size).toBe(0);
    expect(await openPendingAction(cookie, secret, store)).toEqual(small);
    const changed = `${cookie[0] === "A" ? "B" : "A"}${cookie.slice(1)}`;
    expect(await openPendingAction(changed, secret, store)).toBeNull();
  });
  it("surfaces unavailable storage instead of pretending the action was preserved or absent", async () => {
    const unavailable = {
      put: async () => {
        throw new Error("offline");
      },
      get: async () => {
        throw new Error("offline");
      },
    };
    await expect(sealPendingAction(action, secret, unavailable)).rejects.toThrow("offline");
    await expect(openPendingAction(`ref.${"a".repeat(64)}`, secret, unavailable)).rejects.toThrow(
      "offline",
    );
  });
});
