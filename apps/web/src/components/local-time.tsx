"use client";
import { internationalTime, relativeTime, shortTime } from "../lib/time";
import { useTimeZone } from "./time-zone";

type Variant = "datetime" | "date";
const formats: Record<Variant, Intl.DateTimeFormatOptions> = {
  datetime: {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  date: { day: "numeric", month: "short", year: "numeric" },
};

// Explicit account choices render on the server. Automatic waits for the
// browser's timezone; only native no-JS reading falls back to labelled UTC.
export function LocalTime({
  at,
  variant = "datetime",
}: {
  at: string;
  variant?: Variant | "international";
}) {
  const { timeZone, ready, locale } = useTimeZone();
  const format = (zone: string | undefined, language: string | undefined) =>
    variant === "international"
      ? internationalTime(at, zone)
      : new Date(at).toLocaleString(language, { ...formats[variant], timeZone: zone });
  return ready ? (
    <time dateTime={at}>{format(timeZone, locale)}</time>
  ) : (
    <noscript>
      <time dateTime={at}>
        {format("UTC", "en-GB")}
        {variant !== "international" && " UTC"}
      </time>
    </noscript>
  );
}

function useExactTime(at: string) {
  const { timeZone, ready, locale } = useTimeZone();
  const zone = ready ? timeZone : "UTC";
  return {
    zone,
    exact: new Date(at).toLocaleString(locale, {
      ...formats.datetime,
      timeZone: zone,
      ...(!ready && { timeZoneName: "short" as const }),
    }),
  };
}

// Relative ages retain an exact timestamp in the preferred zone on hover.
export function Updated({ at }: { at: string }) {
  const { zone, exact } = useExactTime(at);
  return (
    <time dateTime={at} title={exact} suppressHydrationWarning>
      {relativeTime(at, zone)}
    </time>
  );
}

export function ShortTime({ at }: { at: string }) {
  const { zone, exact } = useExactTime(at);
  return (
    <time dateTime={at} title={exact} suppressHydrationWarning>
      {shortTime(at, zone)}
    </time>
  );
}
