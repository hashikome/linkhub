// App-owned account identity defaults, shared by local auth and future SSO.
import { randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import { isReservedUsername, suggestUsername, USERNAME_MAX, usernameOwner } from "./username";

const adjectives = [
  "bright",
  "calm",
  "curious",
  "gentle",
  "lucid",
  "mellow",
  "open",
  "patient",
  "quiet",
  "silver",
  "steady",
  "subtle",
  "verdant",
  "vivid",
  "warm",
  "winding",
];
const nouns = [
  "atlas",
  "brook",
  "cedar",
  "comet",
  "field",
  "garden",
  "grove",
  "harbor",
  "meadow",
  "orbit",
  "pebble",
  "pine",
  "river",
  "shore",
  "trail",
  "willow",
];

// Public defaults must not reveal email addresses or UUIDv7 timestamps.
export function nameFromHandle(handle: string) {
  return handle
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function generatedHandle() {
  return `${adjectives[randomInt(adjectives.length)]}-${nouns[randomInt(nouns.length)]}-${randomBytes(2).toString("hex")}`;
}

export async function accountUsername(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  name: string,
  available?: (username: string) => Promise<boolean>,
) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 255)
    .replace(/^-+|-+$/g, "");
  if (normalized.length > USERNAME_MAX) {
    const suggestion = await suggestUsername(db, normalized);
    if (suggestion && (!available || (await available(suggestion)))) return suggestion;
  }
  const seed = normalized.slice(0, USERNAME_MAX).replace(/-+$/, "");
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = `-${attempt + 1}`;
    const username =
      seed.length >= 3 && attempt < 25
        ? attempt === 0
          ? seed
          : `${seed.slice(0, USERNAME_MAX - suffix.length).replace(/-+$/, "")}${suffix}`
        : generatedHandle();
    if (isReservedUsername(username)) continue;
    if (!(await usernameOwner(db, username)) && (!available || (await available(username))))
      return username;
  }
  throw new Error("Could not derive a unique username");
}
