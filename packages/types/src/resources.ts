import type { ResourceKind } from "./common.js";
import type { IsoTimestamp } from "./envelope.js";

export interface Resource {
  id: string;
  collectionId: string;
  kind: ResourceKind;
  url?: string;
  linkedCollectionId: string | null;
  /** Viewer-authorized destination metadata; null means unavailable. */
  linkedCollection?: { id: string; title: string } | null;
  /**
   * A link's title from its page (null until looked up), a section's text, or
   * a readable reference's target title. Never an input for links.
   */
  title: string | null;
  /** Fetched link description or authored section context; null for references. */
  description: string | null;
  siteName: string | null;
  /** Who added the item; null when unknown (added before attribution). */
  addedBy: import("./envelope.js").PersonRef | null;
  tags: string[];
  position: number;
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// A link's title is resolved by the server, never sent.
export interface CreateExternalResourceRequest {
  url: string;
  tags?: string[];
  position: number;
}

// Only what people add is editable; an item's own content is fixed.
export interface UpdateResourceRequest {
  version: number;
  tags?: string[];
  position?: number;
  /** Optional authored context, only for sections; empty string clears it. */
  description?: string;
}

export interface ReorderResourcesRequest {
  items: Array<{ resourceId: string; position: number; version: number }>;
}

export interface CreateCollectionResourceRequest {
  linkedCollectionId: string;
  tags?: string[];
  position: number;
}
export interface CreateHeadingResourceRequest {
  title: string;
  description?: string;
  /** Start the section at this existing non-heading item. */
  firstItemId: string;
  firstItemVersion: number;
}

/** Move an item (or a section with its items). Omit destination to append. */
export interface MoveResourceRequest {
  version: number;
  direction?: "up" | "down";
  beforeId?: string;
  beforeVersion?: number;
}
