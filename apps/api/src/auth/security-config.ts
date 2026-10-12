import { readSecret } from "../config/secret";

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}
export function googleCredentials(
  env: Record<string, string | undefined> = process.env,
): GoogleCredentials | undefined {
  const enabled = env.GOOGLE_AUTH_ENABLED?.trim();
  if (enabled && !["true", "false"].includes(enabled))
    throw new Error("GOOGLE_AUTH_ENABLED must be true or false");
  if (enabled === "false") return undefined;
  const clientId = readSecret("GOOGLE_CLIENT_ID", env);
  const clientSecret = readSecret("GOOGLE_CLIENT_SECRET", env);
  if (!clientId && !clientSecret && enabled !== "true") return undefined;
  if (!clientId || !clientSecret)
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together");
  return { clientId, clientSecret };
}
export function authoritativeGoogleEmail(profile: {
  email?: string;
  email_verified?: boolean;
  hd?: string;
}) {
  return (
    profile.email_verified === true && (!!profile.hd || /@gmail\.com$/i.test(profile.email ?? ""))
  );
}
