export interface CaptureLink {
  url: string;
  tags?: string[];
}
export interface CaptureRequest {
  operationId: string;
  startedAt: number;
  /** "first", "new", or the id of a collection to save into. */
  destination: string;
  links: CaptureLink[];
  /** Name for a collection created by this save ("new" or a first capture). */
  collectionTitle?: string;
  published?: boolean;
}
export interface CaptureResult {
  collectionId: string;
  resourceIds: string[];
}
export interface LinkPreview {
  url: string;
  /** Recognized application collection URL; no ownership or availability implied. */
  collectionHint?: boolean;
  title: string | null;
  /** found: title read. untitled: no title (blocked, slow, none) — still saveable.
   *  no_domain: the host name does not exist, so the address is a typo. */
  status: "found" | "untitled" | "no_domain";
}

// Saving takes one or two links copied by hand; more is what import is for.
export const maxCaptureLinks = 2;
// Tags on links and collections: at most 30, each up to 80 characters.
export const maxTags = 30;
export const maxTagLength = 80;
