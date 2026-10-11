import { maxTagLength, maxTags } from "@linkhub/types";

// Browser-safe input checks shared by forms, form routes and client components.

export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && uuidPattern.test(value);

// A savable link address: http(s), no credentials, no control characters,
// at most 2048 characters. Returns the parsed href or null.
export function captureUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    [...value].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
  )
    return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.href.length <= 2048
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// "design, Reading list" → ["design", "Reading list"]. The API normalises and
// validates them; callers that must not send invalid tags use `parseTags`.
export const splitTags = (value: string | null | undefined) =>
  (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
export const parseTags = (value: string | null | undefined) =>
  splitTags(value)
    .map((tag) => tag.slice(0, maxTagLength))
    .slice(0, maxTags);
