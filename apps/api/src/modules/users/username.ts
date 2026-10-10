import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { HANDLE_RE, RESERVED_HANDLES } from "../hubs/handle";
export const reservedUsernames = new Set([
  ...RESERVED_HANDLES,
  "home",
  "settings",
  "profile",
  "notifications",
  "platform",
  "manage",
  "capture",
  "sign-in",
  "sign-up",
  "sign-out",
  "support",
  "c",
  "h",
  "hub",
  "forms",
  "ops",
  "confirm",
  "status",
  "health",
  "people",
  "users",
  "search",
  "saved",
  "shared",
  "share",
  "about",
  "help",
  "terms",
  "privacy",
  "pricing",
  "login",
  "logout",
  "signup",
  "register",
  "billing",
  "account",
  "accounts",
  "assets",
  "static",
  "robots",
  "sitemap",
]);
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const hasValidUsernameFormat = (name: string) =>
  name.length >= USERNAME_MIN && name.length <= USERNAME_MAX && HANDLE_RE.test(name);
export const normalizeUsername = (name: string) => name.trim().toLowerCase();
export const usernameIdentity = (name: string) => normalizeUsername(name).replaceAll("-", "");
const reservedIdentities = new Set([...reservedUsernames].map(usernameIdentity));
export const isReservedUsername = (name: string) => reservedIdentities.has(usernameIdentity(name));

// Keep this expression aligned with users_username_identity_key in migration SQL.
// Exact spelling is for display/routes; all claims use the same identity key.
export async function usernameOwner(db: Pick<Prisma.TransactionClient, "$queryRaw">, name: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE replace(username, '-', '') = ${usernameIdentity(name)} LIMIT 1
  `;
  return rows[0];
}

// Suggestions are checked candidates, never reservations. Only otherwise valid,
// overlong drafts get shortened; invalid punctuation is not silently rewritten.
export async function suggestUsername(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  raw: string,
  ownerId?: string,
): Promise<string | undefined> {
  const name = normalizeUsername(raw);
  if (name.length <= USERNAME_MAX || name.length > 255 || !HANDLE_RE.test(name)) return;
  const stem = name.slice(0, USERNAME_MAX - 5).replace(/-+$/, "");
  const omitted = name.slice(stem.length);
  for (let attempt = 0; attempt < 20; attempt++) {
    const hash = createHash("sha256").update(`${omitted}\0${attempt}`).digest();
    const suffix = (hash.readUInt32BE(0) % 36 ** 4).toString(36).padStart(4, "0");
    const candidate = `${stem}-${suffix}`;
    if (isReservedUsername(candidate)) continue;
    const owner = await usernameOwner(db, candidate);
    if (!owner || owner.id === ownerId) return candidate;
  }
}
