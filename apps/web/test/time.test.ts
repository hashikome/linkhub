import { describe, expect, it } from "bun:test";
import { calendarDate, dayBoundary, internationalTime, shortTime } from "../src/lib/time";

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

it("uses preferred calendar days for filters through DST and fractional offsets", () => {
  expect(calendarDate("2026-10-08T22:30:00Z", "Africa/Dar_es_Salaam")).toBe("2026-10-09");
  expect(dayBoundary("2026-10-09", false, "Asia/Kathmandu")).toBe("2026-10-08T18:15:00.000Z");
  expect(dayBoundary("2026-10-09", true, "Asia/Kathmandu")).toBe("2026-10-09T18:14:59.999Z");
  expect(dayBoundary("2026-03-08", false, "America/New_York")).toBe("2026-03-08T05:00:00.000Z");
  expect(dayBoundary("2026-03-08", true, "America/New_York")).toBe("2026-03-09T03:59:59.999Z");
  expect(dayBoundary("2026-11-01", false, "America/New_York")).toBe("2026-11-01T04:00:00.000Z");
  expect(dayBoundary("2026-11-01", true, "America/New_York")).toBe("2026-11-02T04:59:59.999Z");
  // Sao Paulo skipped midnight when DST began in 2018.
  expect(dayBoundary("2018-11-04", false, "America/Sao_Paulo")).toBe("2018-11-04T03:00:00.000Z");
  for (const input of ["", "2026-02-30", "invalid", "2026-1-1"])
    expect(dayBoundary(input, false, "UTC")).toBe("");
});

it("compares comment years in the selected timezone", () => {
  const now = Date.parse("2026-01-01T01:00:00Z");
  expect(shortTime("2025-12-01T12:00:00Z", "America/Los_Angeles", now)).toBe("1 Dec");
  expect(shortTime("2025-12-01T12:00:00Z", "Asia/Tokyo", now)).toBe("1 Dec 2025");
});
