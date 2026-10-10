import "server-only";
import { cookies } from "next/headers";
import type { Theme } from "../components/theme-picker";
import { serverCookie } from "./cookies";
export async function readTheme(
  name: "appearance" | "reader_appearance" = "appearance",
): Promise<Theme> {
  const value = (await cookies()).get(name)?.value;
  return value === "light" || value === "dark" ? value : "system";
}

export function appearanceCookie(theme: string, signedIn = true) {
  return serverCookie(
    signedIn ? "appearance" : "reader_appearance",
    theme,
    signedIn ? 31536000 : undefined,
  );
}
