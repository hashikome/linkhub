import type { OperatorCollection } from "@ntumie/types";
import type { Metadata } from "next";
import { FormNotice } from "../../../../components/form-notice";
import { OperatorFailure } from "../../../../components/operator-failure";
import { OperationForm } from "../../../../components/operator-ui";
import { failure, queryValue } from "../../../../lib/http";
import { operatorRead } from "../../../../lib/operator-read";
import { isUuid } from "../../../../lib/validation";
export const metadata: Metadata = { title: "Collection moderation" };
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params,
    query = await searchParams;
  if (!isUuid(id)) return <OperatorFailure error={failure("not_found", 404)} />;
  const result = await operatorRead<OperatorCollection | null>(
    `/api/v1/operations/collections/${id}`,
    `/manage/collections/${id}`,
  );
  if (!result.ok) return <OperatorFailure error={result} />;
  if (!result.data)
    return (
      <section className="reader ops-page">
        <h1>Collection unavailable</h1>
        <p>
          No public collection or hold matches this address.{" "}
          <a href="/manage/collections">Paste its link to try again</a>.
        </p>
      </section>
    );
  const c = result.data;
  return (
    <section className="reader ops-page">
      <h1>Collection moderation</h1>
      <FormNotice code={queryValue(query.notice)} />
      <dl className="account-details">
        <dt>Collection ID</dt>
        <dd>{id}</dd>
        <dt>Hub</dt>
        <dd>{c.hubHandle ? `@${c.hubHandle}` : c.hubId}</dd>
        <dt>Distribution</dt>
        <dd>{c.held ? "On hold" : "No direct hold"}</dd>
        {c.reason && (
          <>
            <dt>Last reason</dt>
            <dd>{c.reason.replaceAll("_", " ")}</dd>
          </>
        )}
      </dl>
      {!c.held && (
        <p>
          <a href={`/c/${id}`}>Open the collection with ordinary reader access</a>
        </p>
      )}
      <OperationForm
        action={c.held ? "collection.release" : "collection.hold"}
        targetId={id}
        version={c.version}
        label={c.held ? "Release hold" : "Hold distribution"}
        consequence={
          c.held
            ? "Existing publication and sharing may become available again. Account suspension still applies."
            : "Stop access for everyone except the active owner, including shared links and direct shares. Linked collections keep their own access. The owner can correct the content. Nothing is deleted."
        }
      />
      <p>
        <a href={`/manage/audit?${new URLSearchParams({ targetId: id })}`}>
          View this collection's operator history
        </a>
      </p>
    </section>
  );
}
