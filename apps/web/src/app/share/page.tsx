import type { ShareDescriptor, ShareKind } from "@linkhub/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionFeedback } from "../../components/collection-feedback";
import { CollectionShareAccess } from "../../components/collection-share-access";
import { Feedback } from "../../components/feedback";
import { FormNotice } from "../../components/form-notice";
import { ShareScreen } from "../../components/share-screen";
import { queryValue } from "../../lib/http";
import { serverRead } from "../../lib/server-api";
import { readSession } from "../../lib/session";
import { shareReturn, sourcePath } from "../../lib/sharing";

export const metadata: Metadata = { title: "Share", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const presentation: Record<ShareKind, { heading: string; label: string }> = {
  site: { heading: "Share linkhub", label: "Site link" },
  profile: { heading: "Share profile", label: "Profile link" },
  hub: { heading: "Share hub", label: "Hub link" },
  collection: { heading: "Share collection", label: "Collection link" },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const kind = queryValue(query.kind) ?? "";
  const params = new URLSearchParams({ kind });
  const id = queryValue(query.id);
  if (id !== undefined) params.set("id", id);
  const result = await serverRead<ShareDescriptor>(
    `/api/v1/share/resolve?${params}`,
    queryValue(query.s, 512),
  );
  if (!result.ok) {
    if (result.status === 400) notFound();
    const path = sourcePath("/share", query);
    return kind === "collection" ? (
      <CollectionFeedback error={result} returnTo={path} />
    ) : (
      <Feedback hub={kind === "hub"} error={result} resetPath={path} />
    );
  }
  const share = result.data;
  const session = await readSession();
  const back = shareReturn(queryValue(query.returnTo), share.path);
  return (
    <ShareScreen
      heading={presentation[share.kind].heading}
      name={share.name}
      resourcePath={share.path}
      url={share.url}
      linkLabel={presentation[share.kind].label}
      back={back}
      restricted={share.access === "restricted"}
      target={
        session
          ? share.kind === "site"
            ? { kind: "site" }
            : { kind: share.kind, id: share.id as string }
          : undefined
      }
      token={share.kind === "collection" ? queryValue(query.s, 512) : undefined}
    >
      <FormNotice code={queryValue(query.notice)} />
      {share.kind === "collection" && share.id && share.capabilities.canManageAccess && (
        <CollectionShareAccess id={share.id} returnTo={back.href} />
      )}
    </ShareScreen>
  );
}
