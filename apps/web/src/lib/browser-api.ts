import { browserApiOrigin, webBrowserConfig } from "@ntumie/config/web-browser";
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

// Same-origin pagination retains the browser request context at the web server.
export function readAuditPage<T>(query: URLSearchParams, signal: AbortSignal) {
  return readJson<T>(`/manage/audit/more?${query}`, { timeout: 10000, signal });
}
