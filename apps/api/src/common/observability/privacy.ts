import type { LogRecord } from "@logtape/logtape";
import type * as Sentry from "@sentry/bun";

export const eventNames = new Set([
  "http.request",
  "auth.diagnostic",
  "email.delivery_failed",
  "email.relay_failed",
  "email.worker_started",
  "email.worker_stopped",
  "budget.maintenance_failed",
  "imports.cleanup_failed",
  "imports.job_failed",
  "health.transition",
  "application.started",
  "application.failed",
  "application.stopped",
  "nest.log",
  "nest.error",
  "nest.warning",
  "nest.debug",
  "nest.trace",
]);

// Register only server-declared route templates. Never register request URLs.
const routes = new Set(["<unmatched>", "/api/v1/auth/{*any}"]);
export function registerRouteTemplate(route: string): string {
  routes.add(route);
  return route;
}
export function safeRoute(value: unknown): string {
  return typeof value === "string" && routes.has(value) ? value : "<unmatched>";
}
export function safeMethod(value: unknown): string {
  return typeof value === "string" && /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(value)
    ? value
    : "OTHER";
}
export function errorClass(error: unknown): string {
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof SyntaxError) return "SyntaxError";
  return "Error";
}

type Primitive = string | number | boolean;
export function safeProperties(input: Record<string, unknown>): Record<string, Primitive> {
  const output: Record<string, Primitive> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "http.route") output[key] = safeRoute(value);
    else if (key === "http.method") output[key] = safeMethod(value);
    else if (
      ["http.status_code", "http.duration_ms"].includes(key) &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    )
      output[key] = value;
    else if (key === "http.aborted" && typeof value === "boolean") output[key] = value;
    else if (key === "request.id" && typeof value === "string" && /^req_[\w-]{16}$/.test(value))
      output[key] = value;
    else if (key === "trace.id" && typeof value === "string" && /^[a-f0-9]{32}$/.test(value))
      output[key] = value;
    else if (
      key === "http.result" &&
      ["succeeded", "rejected", "failed", "canceled"].includes(String(value))
    )
      output[key] = String(value);
    else if (
      key === "error.class" &&
      ["Error", "TypeError", "RangeError", "SyntaxError"].includes(String(value))
    )
      output[key] = String(value);
    else if (
      key === "health.status" &&
      ["ready", "degraded", "unavailable"].includes(String(value))
    )
      output[key] = String(value);
    else if (key === "environment" && ["development", "test", "production"].includes(String(value)))
      output[key] = String(value);
    else if (key === "release" && typeof value === "string" && /^[a-f0-9]{40}$/.test(value))
      output[key] = value;
    else if (key === "service.name" && value === "api") output[key] = value;
  }
  return output;
}

export function safeRecord(record: LogRecord): LogRecord {
  const event =
    typeof record.rawMessage === "string" && eventNames.has(record.rawMessage)
      ? record.rawMessage
      : "nest.log";
  return {
    ...record,
    category: ["api"],
    rawMessage: event,
    message: [event],
    properties: safeProperties(record.properties),
  };
}

function traceContext(context: Sentry.ErrorEvent["contexts"]): Sentry.ErrorEvent["contexts"] {
  const trace = context?.trace;
  if (
    !trace ||
    !/^[a-f0-9]{32}$/.test(String(trace.trace_id)) ||
    !/^[a-f0-9]{16}$/.test(String(trace.span_id))
  )
    return {};
  return { trace: { trace_id: trace.trace_id, span_id: trace.span_id, op: "http.server" } };
}

// Reconstruct SDK envelopes: a blacklist cannot cover arbitrary authored data.
export function safeErrorEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: "javascript",
    level: "error",
    environment: ["development", "test", "production"].includes(event.environment ?? "")
      ? event.environment
      : undefined,
    release: /^[a-f0-9]{40}$/.test(event.release ?? "") ? event.release : undefined,
    contexts: traceContext(event.contexts),
    tags: safeProperties(event.tags ?? {}),
    exception: {
      values: (event.exception?.values ?? []).slice(0, 1).map((value) => ({
        type: ["TypeError", "RangeError", "SyntaxError"].includes(value.type ?? "")
          ? value.type
          : "Error",
        value: "Unexpected application failure",
        // Line numbers remain useful; source paths, snippets, variables and
        // arbitrary error messages never cross the boundary.
        stacktrace: {
          frames: (value.stacktrace?.frames ?? []).slice(-30).map((frame) => ({
            filename: "application",
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          })),
        },
      })),
    },
  };
}

export function safeSpan(
  span: ReturnType<typeof Sentry.spanToJSON>,
): ReturnType<typeof Sentry.spanToJSON> {
  const data = safeProperties(span.data ?? {});
  return {
    span_id: span.span_id,
    trace_id: span.trace_id,
    parent_span_id: span.parent_span_id,
    start_timestamp: span.start_timestamp,
    timestamp: span.timestamp,
    description: `${safeMethod(data["http.method"])} ${safeRoute(data["http.route"])}`,
    op: "http.server",
    data,
  };
}

export function safeTransaction(
  event: Parameters<NonNullable<Sentry.BunOptions["beforeSendTransaction"]>>[0],
): Parameters<NonNullable<Sentry.BunOptions["beforeSendTransaction"]>>[0] {
  const properties = safeProperties(event.tags ?? {});
  return {
    type: "transaction",
    event_id: event.event_id,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    transaction: `${safeMethod(properties["http.method"])} ${safeRoute(properties["http.route"])}`,
    transaction_info: { source: "route" },
    contexts: traceContext(event.contexts),
    tags: properties,
    spans: (event.spans ?? []).map(safeSpan),
  };
}
