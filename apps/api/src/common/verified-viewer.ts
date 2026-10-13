import type { AuthUser } from "./interfaces/auth-user.interface";

// Session resolution has just required an active account. A read in the same
// request may reuse that proof briefly instead of querying it again. Writes,
// workers, copied principals and long-running reads re-check the database.
const verifiedAt = new WeakMap<AuthUser, number>();
export const VERIFIED_VIEWER_REUSE_MS = 1000;

export function markVerifiedReadViewer(user: AuthUser, now = performance.now()) {
  verifiedAt.set(user, now);
}

export function recentlyVerifiedViewer(user: AuthUser, now = performance.now()) {
  const at = verifiedAt.get(user);
  return at !== undefined && now - at >= 0 && now - at < VERIFIED_VIEWER_REUSE_MS;
}
