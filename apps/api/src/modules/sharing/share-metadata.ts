import { createHash } from "node:crypto";
import {
  type ApiWarning,
  SHARE_ATTRIBUTION_KEYS,
  type ShareAttribution,
  type ShareContext,
} from "@ntumie/types";
import { isISO8601 } from "class-validator";

export function ignored(warnings: ApiWarning[], field: string, message: string) {
  warnings.push({ code: "optional_field_ignored", field, message });
}

function validText(value: string): boolean {
  return !value.includes("\u0000") && Buffer.from(value).toString() === value;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Bounds are field-local: never discard an otherwise valid opening event. */
export function readContext(value: unknown, warnings: ApiWarning[]): ShareContext | null {
  if (value === undefined || value === null) return null;
  let nodes = 0;
  const valid = (item: unknown, depth: number): boolean => {
    if (++nodes > 256 || depth > 6) return false;
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return validText(item);
    if (Array.isArray(item)) return item.every((v) => valid(v, depth + 1));
    return (
      object(item) &&
      Object.entries(item).every(
        ([key, v]) =>
          !["__proto__", "prototype", "constructor"].includes(key) &&
          validText(key) &&
          valid(v, depth + 1),
      )
    );
  };
  if (!object(value) || !valid(value, 0) || Buffer.byteLength(JSON.stringify(value)) > 8192) {
    ignored(
      warnings,
      "context",
      "Context was omitted: expected a JSON object within size and nesting limits.",
    );
    return null;
  }
  return value as ShareContext;
}

export function readAttribution(value: unknown, warnings: ApiWarning[]): ShareAttribution | null {
  if (value === undefined || value === null) return null;
  if (!object(value)) {
    ignored(
      warnings,
      "attribution",
      "Attribution was omitted: expected an object of recognized UTM strings.",
    );
    return null;
  }
  const result: ShareAttribution = {};
  if (
    Object.keys(value).some((key) => !(SHARE_ATTRIBUTION_KEYS as readonly string[]).includes(key))
  )
    ignored(warnings, "attribution", "Unsupported attribution fields were ignored.");
  for (const key of SHARE_ATTRIBUTION_KEYS) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    if (typeof item !== "string" || item.trim().length > 256 || !validText(item)) {
      ignored(
        warnings,
        `attribution.${key}`,
        "Expected a string of at most 256 characters; this field was ignored.",
      );
      continue;
    }
    if (item.trim()) result[key] = item.trim();
  }
  return Object.keys(result).length ? result : null;
}

export function readOccurredAt(value: unknown, warnings: ApiWarning[]): Date | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value === "string" &&
    value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    isISO8601(value, { strict: true }) &&
    Number.isFinite(Date.parse(value))
  )
    return new Date(value);
  ignored(
    warnings,
    "occurredAt",
    "Occurrence time was omitted: expected an ISO timestamp with timezone.",
  );
  return null;
}

/** Stable across object key order; timestamps/event IDs are intentionally excluded by callers. */
export function payloadHash(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : object(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, canonical(item[key])]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
