/** Share resolution never creates a grant or changes resource visibility. */
export type ShareKind = "site" | "profile" | "hub" | "collection";
export type ShareTarget = { kind: "site" } | { kind: Exclude<ShareKind, "site">; id: string };
/** POST /api/v1/share; custom text travels in JSON, never in the copied URL. */
export type ShareRequest = ShareTarget & {
  message?: string;
  context?: ShareContext;
  operationId?: string;
};

export interface ShareDescriptor {
  kind: ShareKind;
  id: string | null;
  name: string;
  /** Plain text accompanying the URL. Clients must render it as text, not HTML. */
  message: string;
  /** Absolute public-web address, including a validated private link token only when applicable. */
  url: string;
  /** Local web destination for opening this same shareable resource. */
  path: string;
  /** restricted means recipients must already have access. */
  access: "public" | "link" | "restricted";
  capabilities: { canManageAccess: boolean };
}

/** Private sharing history. A record is neither an access grant nor proof of delivery. */
export interface ShareEntry {
  /** The share entry ID; distinct from resourceId. */
  id: string;
  kind: ShareKind;
  resourceId: string | null;
  createdByUserId: string;
  createdAt: string;
  openCount: number;
  message: string | null;
  /** Sharing intent; redacted in service metadata. */
  context: ShareContext | null;
  /** Current resource context; null when deleted or no longer accessible. */
  resource: Omit<ShareDescriptor, "message"> | null;
}

/** POST returns the resolved resource and message immediately. */
export interface CreatedShareEntry extends ShareEntry {
  message: string;
  resource: Omit<ShareDescriptor, "message">;
}

export interface ShareAnalytics {
  scope: "mine" | "resource" | "service";
  /** Share requests, not confirmed deliveries, clicks or unique visitors. */
  total: number;
  opens: number;
  /** Requests outside the top 100 destination groups. */
  otherDestinationCount: number;
  byDestination: { destination: string | null; count: number; opens: number }[];
  byKind: { kind: ShareKind; count: number; opens: number }[];
}

/** Report only after loading the matching resource; reuse eventId when retrying. */
export type ShareContextValue =
  | string
  | number
  | boolean
  | null
  | ShareContextValue[]
  | ShareContext;
export interface ShareContext {
  [key: string]: ShareContextValue;
}

/** Standard UTM spelling is preserved for interoperability. */
export const SHARE_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_id",
  "utm_term",
  "utm_content",
] as const;
export type ShareAttribution = Partial<Record<(typeof SHARE_ATTRIBUTION_KEYS)[number], string>>;
export type ShareOpenPayload = ShareTarget & {
  attribution?: ShareAttribution;
  context?: ShareContext;
  /** Client-reported occurrence time; never substitutes for server createdAt. */
  occurredAt?: string;
};
export type ShareOpenRequest = ShareOpenPayload & { eventId: string };
export interface ShareOpenResult {
  recorded: true;
  created: boolean;
}

/** Call once per visit; retain the returned object unchanged for retries. */
export function createShareOpenEvent(payload: ShareOpenPayload): ShareOpenRequest {
  return {
    ...structuredClone(payload),
    eventId: crypto.randomUUID(),
    occurredAt: payload.occurredAt ?? new Date().toISOString(),
  };
}

/** Explicitly pick common attribution, never copy arbitrary query fields or access tokens. */
export function shareAttributionFromParams(params: URLSearchParams): ShareAttribution {
  return Object.fromEntries(
    SHARE_ATTRIBUTION_KEYS.flatMap((key) => {
      const value = params.get(key);
      return value === null ? [] : [[key, value]];
    }),
  );
}
