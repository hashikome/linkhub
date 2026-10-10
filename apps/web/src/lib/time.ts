// Each unit applies while the value is below its limit, then converts upward.
const units: [Intl.RelativeTimeFormatUnit, number, number][] = [
  ["minute", 60, 60],
  ["hour", 24, 24],
  ["day", 7, 7],
  ["week", 5, 1],
];
// GitHub-style recency ("3 hours ago"); after a month the date itself is
// clearer, shown in `timeZone` (UTC on the server, local in the browser).
export function relativeTime(at: string, timeZone?: string) {
  const date = new Date(at);
  let value = (Date.now() - date.getTime()) / 60000;
  if (value < 1) return "just now";
  for (const [unit, limit, next] of units) {
    if (value < limit)
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        -Math.floor(value),
        unit,
      );
    value /= next;
  }
  return `on ${date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  })}`;
}

// Compact age for comments, TikTok-style: now, 5s, 53m, 23h, 2d, then a date
// ("Oct 7", with the year when it isn't this year).
export function shortTime(at: string, timeZone?: string, now = Date.now()) {
  const date = new Date(at);
  const seconds = Math.floor((now - date.getTime()) / 1000);
  if (seconds < 1) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone,
  });
}
// Numeric ISO calendar date and 24-hour clock in the viewer's time zone.
export function internationalTime(at: string, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-GB-u-ca-iso8601-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(at));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}
