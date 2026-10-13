import "server-only";
import { cookies } from "next/headers";
import type { Theme } from "../components/theme-picker";
import { serverCookie } from "./cookies";

export async function readTheme(): Promise<Theme> {
  const value = (await cookies()).get("appearance")?.value;
  return value === "light" || value === "dark" ? value : "system";
}

export function appearanceCookie(theme: Theme) {
  return serverCookie("appearance", theme, 31536000);
}
