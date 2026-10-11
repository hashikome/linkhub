import "server-only";
import { webServerConfig } from "@nslinkhub/config/web-server";
import { headers } from "next/headers";
import { type ApiPath, postJson, readJson, safePath } from "./http";
import { visitorHeaders } from "./visitor-source";

// All visitor-triggered server calls cross this boundary, including SSR recovery
// POSTs. No optional bypass: background services need their own reviewed policy.
export async function serverGet<T>(
  path: ApiPath,
  options: Parameters<typeof readJson>[1],
  incoming?: Headers,
) {
  return readJson<T>(`${webServerConfig().apiOrigin}${safePath(path)}`, {
    ...options,
    headers: visitorHeaders(
      incoming ?? (await headers()),
      options.headers ?? {},
      webServerConfig().sourceSecret,
    ),
  });
}
export async function serverSend<T>(
  path: ApiPath,
  body: unknown,
  options: Parameters<typeof postJson>[2],
  incoming?: Headers,
) {
  return postJson<T>(`${webServerConfig().apiOrigin}${safePath(path)}`, body, {
    ...options,
    headers: visitorHeaders(
      incoming ?? (await headers()),
      options.headers ?? {},
      webServerConfig().sourceSecret,
    ),
  });
}
