import { publicOrigins } from "@ntumie/config/public-origins";
import { collectionAddress, isPublicLinkHost } from "@ntumie/types";
import { appError } from "../errors/app-exception";

export function canonicalizeUrl(url: string) {
  const parsed = new URL(url);

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();

  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  if (parsed.pathname === "") {
    parsed.pathname = "/";
  }

  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !/^utm_/i.test(key) && !["fbclid", "gclid"].includes(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));

  parsed.search = "";
  for (const [key, value] of params) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}

// The canonical form of a link people may save: reachable on the public web.
export function publicLinkUrl(url: string) {
  const canonical = canonicalizeUrl(url);
  if (!isPublicLinkHost(new URL(canonical).hostname)) throw appError("link_not_public");
  return canonical;
}

export function localCollectionAddress(url: string) {
  return collectionAddress(url, publicOrigins(process.env).webOrigin);
}

// Only recognized application routes bypass public-host validation in local
// development. They are never fetched by the metadata worker.
export function savableLinkUrl(url: string) {
  return localCollectionAddress(url) ? canonicalizeUrl(url) : publicLinkUrl(url);
}
