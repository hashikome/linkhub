import { browserApiOrigin, webBrowserConfig } from "@nslinkhub/config/web-browser";
import { type ApiPath, readJson, safePath } from "./http";

export async function browserRead<T>(path: ApiPath, signal: AbortSignal, token?: string) {
  const target = safePath(path);
  if (!target.startsWith(`${webBrowserConfig.apiPath}/`)) throw new Error("Invalid API path");
  return readJson<T>(`${browserApiOrigin()}${target}`, {
    credentials: "include",
    timeout: 10000,
    signal,
    headers: token ? { "x-share-token": token } : undefined,
  });
}
