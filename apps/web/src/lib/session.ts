import "server-only";
import type { Profile, SessionView } from "@linkhub/types";
import { headers } from "next/headers";
import { cache } from "react";
import { sessionCookie } from "./http";
import { serverRead } from "./server-api";
export const readSession = cache(async (): Promise<SessionView | null> => {
  if (!sessionCookie((await headers()).get("cookie") ?? "")) return null;
  const result = await serverRead<SessionView>("/api/v1/session");
  return result.ok ? result.data : null;
});

// Reads the profile directly (in parallel with the session read) when a session
// cookie exists; the API answers 401 for an invalid one.
export const readOwnProfile = cache(async () => {
  if (!sessionCookie((await headers()).get("cookie") ?? "")) return null;
  const result = await serverRead<Profile>("/api/v1/profile");
  return result.ok ? result.data : null;
});
