import type { ApiErrorPayload } from "./errors.js";

// The API response envelope. Every endpoint returns exactly one of these
// (see docs/design-docs/conventions.md). Timestamps in payloads are ISO 8601
// strings — the JSON wire format, not the backend's in-memory Date.

export type IsoTimestamp = string;

export interface CursorMeta {
  /** Resources only: the section continued by the first item on this page. */
  section?: import("./resources.js").Resource;
  /** Audit-only canonical filters. Actor and hub contain full UUIDs after lookup. */
  auditFilters?: {
    /** Case-insensitive search of displayed audit content; retained across pages. */
    q?: string;
    view?: "actions" | "all";
    actor?: string;
    hub?: string;
    targetId?: string;
    action?: string;
    from?: string;
    to?: string;
  };
  limit: number;
  nextCursor: string | null;
}

export interface ApiWarning {
  code: "optional_field_ignored";
  field: string;
  message: string;
}

export interface ApiSuccess<T, M = undefined> {
  warnings?: ApiWarning[];
  data: T;
  meta?: M;
}

export interface ApiError {
  error: ApiErrorPayload;
}

export type ApiResponse<T, M = undefined> = ApiSuccess<T, M> | ApiError;

// Public person attribution; mutable username links to the profile, IDs bind data.
export interface PersonRef {
  userId: string;
  username: string;
}
