import type { IsoTimestamp } from "./envelope.js";

// The authenticated user's own profile (GET/PATCH /profile). `handle`/`hubId`
// describe the user's one hub; `hubId` is the client's entry point to every
// hub-scoped call.
export interface Profile {
  id: string;
  username: string;
  handleClaimedAt: IsoTimestamp | null;
  displayName: string;
  bio: string | null;
  /** Hub setting: publish its owner connection. Null when the person has no hub. */
  showOwner: boolean | null;
  handle: string | null;
  hubId: string | null;
  hubName: string | null;
  email: string;
  hubDescription: string | null;
  image: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface UpdateProfileRequest {
  /** Stored lowercase, 3–20 letters/digits with single internal hyphens. */
  username?: string;
  /** Explicitly confirm the permanent hub handle choice. */
  confirmHandle?: boolean;
  hubName?: string;
  displayName?: string;
  /** Public plain text, at most 500 characters. Empty string clears it. */
  bio?: string;
  showOwner?: boolean;
  handle?: string;
  hubDescription?: string;
}

export interface HandleAvailability {
  handle: string;
  status: "available" | "current" | "invalid" | "reserved" | "taken";
}

export interface PersonProfile {
  person: import("./envelope.js").PersonRef & { name: string | null; bio: string | null };
  hub: { id: string; handle: string; name: string } | null;
  collections: import("./collections.js").Collection[];
}
export interface UsernameAvailability {
  username: string;
  status: HandleAvailability["status"];
  /** Available shortened spelling for an overlong draft; not a reservation. */
  suggestion?: string;
}
