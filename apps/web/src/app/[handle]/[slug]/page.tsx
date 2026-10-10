import type { Collection, HubPage } from "@nslinkhub/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionFeedback } from "../../../components/collection-feedback";
import { CollectionReader } from "../../../components/collection-reader";
import { failure, prettyPath, queryValue, routeHandle, routeSegment } from "../../../lib/http";
import { serverRead } from "../../../lib/server-api";
import { sourcePath } from "../../../lib/sharing";

export const metadata: Metadata = { title: "Collection" };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const route = await params;
  const segment = routeSegment(route.handle);
  const slug = routeSegment(route.slug);
  if (!segment.startsWith("@")) notFound();
  const handle = routeHandle(segment);
  if (!handle || !/^[a-z0-9-]{2,120}$/.test(slug))
    return <CollectionFeedback error={failure("not_found", 404)} returnTo="/discover" />;
  const query = await searchParams;
  const token = queryValue(query.s, 512);
  const resetPath = prettyPath(handle, slug) + (token ? `?s=${encodeURIComponent(token)}` : "");
  // Hub discovery never receives collection access tokens.
  const hub = await serverRead<HubPage>(
    `/api/v1/hubs/by-handle/${encodeURIComponent(handle)}?limit=1`,
  );
  if (!hub.ok) return <CollectionFeedback error={hub} returnTo={sourcePath(resetPath, query)} />;
  const result = await serverRead<Collection>(
    `/api/v1/hubs/${encodeURIComponent(hub.data.hub.id)}/collections/${encodeURIComponent(slug)}`,
    token,
  );
  if (!result.ok)
    return <CollectionFeedback error={result} returnTo={sourcePath(resetPath, query)} />;
  return (
    <CollectionReader
      collection={result.data}
      query={query}
      hub={hub.data.hub}
      resetPath={resetPath}
    />
  );
}
