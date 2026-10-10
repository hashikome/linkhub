// Shared hub-handle rules, used by both HubsService (rename) and the
// framework-free onboarding path (auto-generated handle at sign-up). Kept as a
// plain module with no Nest/alias imports so the standalone better-auth
// instance can import it by relative path from the onboarding hook.

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 60;
export const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Handles that would collide with API path segments or read confusingly as a
// public space identity (they must never be issued, including at sign-up).
// Format is enforced again by a DB CHECK constraint.
export const RESERVED_HANDLES = new Set([
  "api",
  "discover",
  "explore",
  "me",
  "hubs",
  "collections",
  "resources",
  "tags",
  "imports",
  "exports",
  "invitations",
  "auth",
  "admin",
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle);
}

export function hasValidHandleFormat(handle: string): boolean {
  return handle.length >= HANDLE_MIN && handle.length <= HANDLE_MAX && HANDLE_RE.test(handle);
}

// Keep the SQL reserve_hub_handle trigger's interval in sync with this policy.
export const HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
export function handleChangeAvailableAt(changedAt: Date | null | undefined): string | null {
  if (!changedAt) return null;
  const availableAt = new Date(changedAt.getTime() + HANDLE_CHANGE_COOLDOWN_MS);
  return availableAt.getTime() > Date.now() ? availableAt.toISOString() : null;
}
