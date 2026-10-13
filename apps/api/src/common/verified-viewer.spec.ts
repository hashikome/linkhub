import { describe, expect, it } from "bun:test";
import {
  markVerifiedReadViewer,
  recentlyVerifiedViewer,
  VERIFIED_VIEWER_REUSE_MS,
} from "./verified-viewer";

describe("verified read viewer", () => {
  it("reuses only the marked principal object, briefly", () => {
    const viewer = { userId: "u", sessionId: "s" };
    expect(recentlyVerifiedViewer(viewer, 0)).toBe(false);
    markVerifiedReadViewer(viewer, 100);
    expect(recentlyVerifiedViewer(viewer, 100)).toBe(true);
    expect(recentlyVerifiedViewer(viewer, 100 + VERIFIED_VIEWER_REUSE_MS - 1)).toBe(true);
    expect(recentlyVerifiedViewer(viewer, 100 + VERIFIED_VIEWER_REUSE_MS)).toBe(false);
    expect(recentlyVerifiedViewer(viewer, 99)).toBe(false);
    expect(recentlyVerifiedViewer({ ...viewer }, 100)).toBe(false);
  });
});
