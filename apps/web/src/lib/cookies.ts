import "server-only";
import { webServerConfig } from "@ntumie/config/web-server";

// Every cookie the web sets: HTTP-only, same-site, whole-site, Secure on https.
export function serverCookie(name: string, value: string, maxAge?: number) {
  const secure = webServerConfig().publicOrigin.startsWith("https:") ? "; Secure" : "";
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/${maxAge === undefined ? "" : `; Max-Age=${maxAge}`}${secure}`;
}
