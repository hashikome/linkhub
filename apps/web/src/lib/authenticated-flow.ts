import "server-only";
import { readFlow } from "./form-server";
import type { SecurityStatus } from "./security-types";
import { serverRead } from "./server-api";
import { readOwnProfile } from "./session";

// Only a newly verified backend session can finish the browser's sealed flow.
export async function authenticatedFlow() {
  const [flow, profile, status] = await Promise.all([
    readFlow(),
    readOwnProfile(),
    serverRead<SecurityStatus>("/api/v1/auth/security/status"),
  ]);
  if (
    !flow ||
    !profile ||
    !status.ok ||
    !status.data.verifiedAt ||
    Date.parse(status.data.verifiedAt) < flow.issued - 1000
  )
    return null;
  return { ...flow, email: profile.email };
}
