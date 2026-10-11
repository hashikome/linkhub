import type { DependencyStatus } from "./status.js";

// Safe fallback text is part of the API protocol. Clients branch on codes and
// own presentation/localization; never parse server exception messages.
export const apiErrors = {
  capture_destination_required: { status: 409, message: "Choose a collection for this link" },
  invitation_session_mismatch: {
    status: 403,
    message: "Sign out before accepting an invitation for another account",
  },
  recent_auth_required: { status: 403, message: "Sign in again to continue" },
  collection_held: { status: 403, message: "Collection distribution is restricted" },
  comments_disabled: { status: 403, message: "Comments are turned off for this collection" },
  bad_request: { status: 400, message: "Invalid request" },
  link_not_public: {
    status: 400,
    message:
      "Use a public web address; local, private and example addresses can't be opened by others",
  },
  unauthorized: { status: 401, message: "Authentication required" },
  forbidden: { status: 403, message: "Forbidden" },
  not_found: { status: 404, message: "Not found" },
  method_not_allowed: { status: 405, message: "Method not allowed" },
  request_timeout: { status: 408, message: "Request timed out" },
  conflict: { status: 409, message: "Request conflicts with current state" },
  payload_too_large: { status: 413, message: "Payload too large" },
  unsupported_media_type: { status: 415, message: "Unsupported media type" },
  too_many_requests: { status: 429, message: "Too many requests" },
  internal_error: { status: 500, message: "Internal server error" },
  service_unavailable: { status: 503, message: "Service temporarily unavailable" },
  dependencies_unavailable: { status: 503, message: "Required dependencies are unavailable" },
  validation_failed: { status: 400, message: "Validation failed" },
  invalid_cursor: { status: 400, message: "Invalid cursor" },
  version_conflict: { status: 409, message: "Version mismatch" },
  username_invalid: { status: 400, message: "Invalid username" },
  username_reserved: { status: 400, message: "Username is reserved" },
  username_unavailable: { status: 409, message: "Username is unavailable" },
  handle_invalid: { status: 400, message: "Invalid handle" },
  handle_reserved: { status: 400, message: "Handle is reserved" },
  handle_change_cooldown: {
    status: 409,
    message: "You can change your hub handle once every 30 days",
  },
  handle_unavailable: { status: 400, message: "Handle already taken" },
  email_conflict: { status: 409, message: "Email already exists" },
  duplicate_resource: { status: 409, message: "Link already exists in this collection" },
  position_conflict: { status: 409, message: "Position is already used in this collection" },
  section_empty: { status: 409, message: "Each section must contain at least one item" },
  invalid_reorder: { status: 400, message: "Invalid resource order" },
  invalid_transfer: { status: 400, message: "Invalid ownership transfer" },
  transfer_requires_contributor: {
    status: 400,
    message: "Recipient must already be a contributor",
  },
  collection_not_published: { status: 400, message: "Only published collections can be saved" },
  invalid_import: { status: 400, message: "Invalid import" },
  hub_unavailable: { status: 400, message: "No hub available" },
} as const;

export type ApiErrorCode = keyof typeof apiErrors;
export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && Object.hasOwn(apiErrors, value);
}
export type ValidationRule =
  | "required"
  | "string"
  | "integer"
  | "boolean"
  | "array"
  | "email"
  | "url"
  | "uuid"
  | "minimum"
  | "maximum"
  | "min_length"
  | "max_length"
  | "format"
  | "choice"
  | "min_items"
  | "max_items"
  | "nested"
  | "unique_items"
  | "unknown_field"
  | "invalid";
export interface ValidationIssue {
  /** DTO-declared path; * denotes an array element and $ an unspecified field. */
  field: string;
  rule: ValidationRule;
}
export type EmptyDetails = Record<string, never>;
export type ApiErrorDetails<C extends ApiErrorCode> = C extends "validation_failed"
  ? { issues: ValidationIssue[] }
  : C extends "dependencies_unavailable"
    ? { dependencies: DependencyStatus }
    : EmptyDetails;
export type ApiErrorPayload = {
  [C in ApiErrorCode]: { code: C; message: string; requestId: string; details: ApiErrorDetails<C> };
}[ApiErrorCode];
