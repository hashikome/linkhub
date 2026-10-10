import { describe, expect, it } from "bun:test";
import { createShareOpenEvent, shareAttributionFromParams } from "@nslinkhub/types";
import { safeReturn } from "../src/lib/http";

describe("share event client helpers", () => {
  it("creates distinct visits, snapshots metadata and retains a stable retry payload", () => {
    const payload = { kind: "site" as const, context: { nested: { campaign: "one" } } };
    const event = createShareOpenEvent(payload);
    const retry = JSON.stringify(event);
    payload.context.nested.campaign = "changed";
    expect(JSON.stringify(event)).toBe(retry);
    expect(event.eventId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
    );
    expect(event.occurredAt).toBeString();
    expect(createShareOpenEvent(payload).eventId).not.toBe(event.eventId);
  });
  it("selects only recognized attribution and preserves it through private sign-in", () => {
    const id = crypto.randomUUID();
    const params = new URLSearchParams({
      via: id,
      s: "secret",
      utm_source: "WhatsApp",
      utm_medium: "social",
      message: "private",
      arbitrary: "ignored",
    });
    expect(shareAttributionFromParams(params)).toEqual({
      utm_source: "WhatsApp",
      utm_medium: "social",
    });
    expect(safeReturn(`/c/${id}?${params}`)).toBe(
      `/c/${id}?s=secret&via=${id}&utm_source=WhatsApp&utm_medium=social`,
    );
    expect(safeReturn(`/c/${id}?share_id=${id}`)).toBe(`/c/${id}`);
    expect(safeReturn(`/c/${id}?via=bad&utm_source=${"x".repeat(257)}`)).toBe(`/c/${id}`);
  });
});
