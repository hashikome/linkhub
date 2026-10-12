import type { Collection } from "@ntumie/types";
import type { Metadata } from "next";
import { Feedback } from "../../components/feedback";
import { PaginatedList } from "../../components/paginated-list";
import { queryValue, withCursor } from "../../lib/http";
import { serverRead } from "../../lib/server-api";

export const metadata: Metadata = { title: "Discover" };
export const dynamic = "force-dynamic";
async function Discover({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cursor = queryValue((await searchParams).cursor);
  const result = await serverRead<Collection[]>(withCursor("/api/v1/discover", cursor));
  if (!result.ok) return <Feedback error={result} resetPath="/discover" />;
  return (
    <section data-reader className="reader collection-browser">
      <div className="page-heading">
        <h1>Someone already found your next good read.</h1>
        <p>Discover the links someone kept.</p>
      </div>
      <PaginatedList
        kind="collections"
        path="/api/v1/discover"
        initial={result.data}
        nextCursor={result.meta?.nextCursor}
      />
    </section>
  );
}
export default function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return Discover(props);
}
