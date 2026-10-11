import type { ShareRole, ShareSource } from "./common.js";
import type { IsoTimestamp } from "./envelope.js";

export interface Collection {
  hub?: {
    id: string;
    handle: string;
    name: string;
    owner?: import("./envelope.js").PersonRef | null;
  };
  // Who created the collection (immutable provenance; may differ from the owner
  // after a transfer). Present on single-collection reads; null if unavailable.
  creator?: import("./envelope.js").PersonRef | null;
  // Everyone who has shaped its content, most recent first (up to five), and
  // how many there are. Present on single-collection reads.
  contributors?: { people: import("./envelope.js").PersonRef[]; total: number };
  /** canManage: the owner; canEdit: a contributor (owner or contributor). */
  capabilities?: { canManage: boolean; canEdit: boolean };
  restriction?: { reason: import("./operations.js").OperationReason; supportUrl: string };
  id: string;
  hubId: string;
  title: string;
  description: string | null;
  /** Unique tags on this collection’s own items, most-used first, alphabetical ties. Stored relation, read-only. */
  tags: string[];
  published: boolean;
  linkSharingEnabled: boolean;
  commentsEnabled: boolean;
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface SharedCollection extends Collection {
  shareRole: ShareRole;
  shareSource: ShareSource;
}

export interface SavedCollection extends Collection {
  savedAt: IsoTimestamp;
  available: boolean;
}

export interface CollectionShareView {
  userId: string;
  displayName: string;
  /** Present for direct shares (the owner supplied it); null for link-source shares. */
  email: string | null;
  role: ShareRole;
  source: ShareSource;
}

export interface CreateCollectionRequest {
  title: string;
  description?: string;
  published?: boolean;
}

export interface UpdateCollectionRequest {
  commentsEnabled?: boolean;
  version: number;
  title?: string;
  description?: string;
  published?: boolean;
}

export interface SetLinkSharingRequest {
  enabled: boolean;
  rotate?: boolean;
}

export interface LinkSharingResult {
  collectionId: string;
  linkSharingEnabled: boolean;
  token?: string;
  queryParam?: string;
}

export interface CreateShareRequest {
  email: string;
  role?: ShareRole;
}

// Current collaborators in the authenticated owner's hub, not service accounts.
export interface HubPerson {
  userId: string;
  username: string;
  collectionCount: number;
}

export type ManagedCollectionAction =
  | "open"
  | "edit"
  | "add_link"
  | "history"
  | "share"
  | "publish"
  | "unpublish"
  | "delete"
  | "transfer"
  | "hold"
  | "release";

export interface ManagedCollection {
  id: string;
  hubId: string;
  hubHandle: string;
  /** Null when only moderation metadata is available. */
  title: string | null;
  visibility: "published" | "link" | "private" | null;
  held: boolean;
  updatedAt: IsoTimestamp | null;
  availableActions: ManagedCollectionAction[];
}

export interface CollectionImpactRequest {
  impactToken?: string;
}

export interface CollectionImpact {
  action: "delete" | "transfer";
  token: string;
  referenceCount: number;
  collections: {
    collectionId: string;
    title: string;
    referenceCount: number;
    removedSections: { id: string; title: string }[];
  }[];
}

export interface TransferCollectionRequest extends CollectionImpactRequest {
  email: string;
}
