import "server-only";
import { cookies } from "next/headers";
import { serverCookie } from "./cookies";

export async function readResourceNewTab() {
  return (await cookies()).get("resource_same_tab")?.value !== "on";
}

export function resourceSameTabCookie(enabled: boolean) {
  return serverCookie("resource_same_tab", enabled ? "on" : "", enabled ? 31536000 : 0);
}
