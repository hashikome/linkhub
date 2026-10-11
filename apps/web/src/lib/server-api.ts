import "server-only";
import { webServerConfig } from "@linkhub/config/web-server";
import { headers } from "next/headers";
import { type ApiPath, authCookies, sessionCookie } from "./http";
import { serverGet, serverSend } from "./server-transport";

export async function serverRead<T>(path: ApiPath, shareToken?: string) {
  const incoming = await headers();
  const outgoing = new Headers({ Accept: "application/json" });
  const cookie = (
    [
      "/api/v1/auth/google-connection",
      "/api/v1/auth/account/recovery",
      "/api/v1/auth/email-registration",
    ].includes(path)
      ? authCookies
      : sessionCookie
  )(incoming.get("cookie") ?? "");
  if (cookie) outgoing.set("cookie", cookie);
  if (shareToken) outgoing.set("x-share-token", shareToken);
  return serverGet<T>(path, { headers: outgoing, timeout: 8000 }, incoming);
}

// A POST preview keeps the emailed token out of request URLs. It is read-only
// and uses the same signed source attribution as ordinary server reads.
export async function invitationPreview<T>(token: string) {
  const incoming = await headers(),
    config = webServerConfig();
  const outgoing = new Headers({ "Content-Type": "application/json", Origin: config.publicOrigin });
  const cookie = sessionCookie(incoming.get("cookie") ?? "");
  if (cookie) outgoing.set("cookie", cookie);
  return serverSend<T>(
    "/api/v1/auth/invitations/preview",
    { token },
    { headers: outgoing, raw: true },
    incoming,
  );
}
