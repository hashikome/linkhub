import type { Collection } from "./collections.js";
import type { IsoTimestamp } from "./envelope.js";

// One hub per user (Google-Drive model): no memberships, no roles beyond the
// owner; sharing happens per collection (see collections.ts).
export interface HubSummary {
  id: string;
  handle: string;
  name: string;
  ownerName: string | null;
  owner: import("./envelope.js").PersonRef | null;
  description: string | null;
  publishedCollectionCount: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface HubPage {
  hub: HubSummary;
  collections: Collection[];
}
