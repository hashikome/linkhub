import "server-only";
import { webServerConfig } from "@ntumie/config/web-server";
import { headers } from "next/headers";
import { markEdgeUncacheable } from "../../server/edge-cache-scope";
import { type ApiPath, postJson, readJson, safePath } from "./http";
import { visitorHeaders } from "./visitor-source";

// All visitor-triggered server calls cross this boundary, including SSR recovery
// POSTs. No optional bypass: background services need their own reviewed policy.
export async function serverGet<T>(
  path: ApiPath,
  options: Parameters<typeof readJson>[1],
  incoming?: Headers,
) {
  const result = await readJson<T>(`${webServerConfig().apiOrigin}${safePath(path)}`, {
    ...options,
    headers: visitorHeaders(
      incoming ?? (await headers()),
      options.headers ?? {},
      webServerConfig().sourceSecret,
    ),
  });
  // Only pages whose every read succeeded may be shared from the edge.
  if (!result.ok) markEdgeUncacheable();
  return result;
}
export async function serverSend<T>(
  path: ApiPath,
  body: unknown,
  options: Parameters<typeof postJson>[2],
  incoming?: Headers,
) {
  markEdgeUncacheable();
  return postJson<T>(`${webServerConfig().apiOrigin}${safePath(path)}`, body, {
    ...options,
    headers: visitorHeaders(
      incoming ?? (await headers()),
      options.headers ?? {},
      webServerConfig().sourceSecret,
    ),
  });
}
