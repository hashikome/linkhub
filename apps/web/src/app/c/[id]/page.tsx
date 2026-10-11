import type { Collection } from "@linkhub/types";
import type { Metadata } from "next";
import { CollectionFeedback } from "../../../components/collection-feedback";
import { CollectionReader } from "../../../components/collection-reader";
import { ShareOpen } from "../../../components/share-open";
import { collectionPath, failure, permalink, queryValue } from "../../../lib/http";
import { serverRead } from "../../../lib/server-api";
import { sourcePath } from "../../../lib/sharing";

export const metadata: Metadata = { title: "Collection" };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
    return <CollectionFeedback error={failure("not_found", 404)} returnTo={permalink(id)} />;
  const query = await searchParams;
  const result = await serverRead<Collection>(collectionPath(id), queryValue(query.s, 512));
  if (!result.ok)
    return <CollectionFeedback error={result} returnTo={sourcePath(permalink(id), query)} />;
  return (
    <>
      <ShareOpen
        shareId={queryValue(query.via)}
        kind="collection"
        resourceId={id}
        token={queryValue(query.s, 512)}
      />
      <CollectionReader collection={result.data} query={query} />
    </>
  );
}
