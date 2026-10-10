"use client";
import { useEffect, useState } from "react";
import { internationalTime, relativeTime, shortTime } from "../lib/time";

type Variant = "datetime" | "date";
const formats: Record<Variant, Intl.DateTimeFormatOptions> = {
  datetime: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  },
  date: { day: "numeric", month: "short", year: "numeric" },
};

// Times in the viewer's own time zone. The server doesn't know it, so the
// first paint (and no-JavaScript reading) shows UTC, labelled as such; the
// browser then switches to local time.
export function LocalTime({
  at,
  variant = "datetime",
}: {
  at: string;
  variant?: Variant | "international";
}) {
  const date = new Date(at);
  const [text, setText] = useState(() =>
    variant === "international"
      ? internationalTime(at, "UTC")
      : date.toLocaleString("en-GB", { ...formats[variant], timeZone: "UTC" }),
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: Formatting depends only on `at`.
  useEffect(() => {
    setText(
      variant === "international"
        ? internationalTime(at)
        : date.toLocaleString(undefined, formats[variant]),
    );
  }, [at, variant]);
  return (
    <time
      dateTime={at}
      title={variant === "international" ? at : undefined}
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}

// "Updated 3 hours ago", with the exact local time on hover. Server and client
// may differ by a minute at a boundary, so the text may change on hydration.
export function Updated({ at }: { at: string }) {
  const [zone, setZone] = useState<string | undefined>("UTC");
  useEffect(() => setZone(undefined), []);
  const exact = new Date(at).toLocaleString(zone ? "en-GB" : undefined, {
    ...formats.datetime,
    timeZone: zone,
  });
  return (
    <time dateTime={at} title={exact} suppressHydrationWarning>
      {relativeTime(at, zone)}
    </time>
  );
}

// The compact age ("53m", "2d", "Oct 7"); the exact time shows on hover.
export function ShortTime({ at }: { at: string }) {
  const [zone, setZone] = useState<string | undefined>("UTC");
  useEffect(() => setZone(undefined), []);
  const exact = new Date(at).toLocaleString(zone ? "en-GB" : undefined, {
    ...formats.datetime,
    timeZone: zone,
  });
  return (
    <time dateTime={at} title={exact} suppressHydrationWarning>
      {shortTime(at, zone)}
    </time>
  );
}
