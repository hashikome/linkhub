import { describe, expect, it } from "bun:test";
import { internationalTime, shortTime } from "../src/lib/time";

describe("comment ages", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  it("reads TikTok-style: now, seconds, minutes, hours, days, then a date", () => {
    expect(shortTime(ago(400), "UTC", now)).toBe("now");
    expect(shortTime(ago(5_000), "UTC", now)).toBe("5s");
    expect(shortTime(ago(59_000), "UTC", now)).toBe("59s");
    expect(shortTime(ago(60_000), "UTC", now)).toBe("1m");
    expect(shortTime(ago(53 * 60_000), "UTC", now)).toBe("53m");
    expect(shortTime(ago(23 * 3_600_000), "UTC", now)).toBe("23h");
    expect(shortTime(ago(2 * 86_400_000), "UTC", now)).toBe("2d");
    expect(shortTime("2026-10-01T09:00:00Z", "UTC", now)).toBe("1 Oct");
    expect(shortTime("2025-03-04T09:00:00Z", "UTC", now)).toBe("4 Mar 2025");
  });
});

it("formats audit dates in the viewer zone across midnight and fractional offsets", () => {
  const at = "2026-10-09T00:15:30.000Z";
  expect(internationalTime(at, "UTC")).toBe("2026-10-09 00:15:30");
  expect(internationalTime(at, "Africa/Dar_es_Salaam")).toBe("2026-10-09 03:15:30");
  expect(internationalTime(at, "America/New_York")).toBe("2026-10-08 20:15:30");
  expect(internationalTime(at, "Asia/Kathmandu")).toBe("2026-10-09 06:00:30");
  expect(internationalTime("2026-10-08T22:05:06.000Z", "Africa/Dar_es_Salaam")).toBe(
    "2026-10-09 01:05:06",
  );
});
