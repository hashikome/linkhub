import "server-only";
import type { Profile, SessionView } from "@ntumie/types";
import { headers } from "next/headers";
import { cache } from "react";
import { failure, sessionCookie } from "./http";
import { serverRead } from "./server-api";
export const readSession = cache(async (): Promise<SessionView | null> => {
  if (!sessionCookie((await headers()).get("cookie") ?? "")) return null;
  const result = await serverRead<SessionView>("/api/v1/session");
  return result.ok ? result.data : null;
});

// Reads the profile directly (in parallel with the session read) when a session
// cookie exists; the API answers 401 for an invalid one.
export const readOwnProfileResult = cache(async () => {
  if (!sessionCookie((await headers()).get("cookie") ?? "")) return failure("unauthorized", 401);
  return serverRead<Profile>("/api/v1/profile");
});

export const readOwnProfile = cache(async () => {
  const result = await readOwnProfileResult();
  return result.ok ? result.data : null;
});
