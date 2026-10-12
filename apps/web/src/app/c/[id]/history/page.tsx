import type { ActivityEntry, Collection, PersonRef } from "@ntumie/types";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CollectionFeedback } from "../../../../components/collection-feedback";
import { Updated } from "../../../../components/local-time";
import { Person } from "../../../../components/primitives";
import { collectionPath, failure, permalink, queryValue, withCursor } from "../../../../lib/http";
import { serverRead } from "../../../../lib/server-api";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

// What each change reads as, GitHub-style: "@editor added a link “Title”".
function sentence(entry: ActivityEntry): ReactNode {
  const item = entry.item?.title ? <q>{entry.item.title}</q> : null;
  const target = entry.target ? <Person person={entry.target} /> : "someone";
  switch (entry.action) {
    case "collection.created":
      return "created the collection";
    case "collection.updated":
      return "changed the collection's details";
    case "collection.published":
      return "published the collection";
    case "collection.unpublished":
      return "unpublished the collection";
    case "collection.transferred_out":
    case "collection.transferred_in":
      return <>transferred the collection to {target}</>;
    case "share.granted":
      return <>shared the collection with {target}</>;
    case "share.revoked":
      return <>removed access for {target}</>;
    case "link.enabled":
      return "turned link sharing on";
    case "link.rotated":
      return "replaced the share link";
    case "link.disabled":
      return "turned link sharing off";
    case "item.link_added":
      return <>added a link {item}</>;
    case "item.reference_added":
      return <>added a reference {item}</>;
    case "item.section_added":
      return <>added a section {item}</>;
    case "item.updated":
      return <>edited {item ?? "an item"}</>;
    case "item.removed":
      return "removed an item";
    case "items.reordered":
      return "reordered the items";
    case "items.imported":
      return "imported links";
    case "comment.hidden":
      return <>hid a comment by {target}</>;
    case "comment.shown":
      return <>showed a comment by {target}</>;
    case "comment.answer_marked":
      return <>marked an answer by {target}</>;
    case "comment.answer_unmarked":
      return "unmarked an answer";
    default:
      return entry.action;
  }
}

function Actor({ person }: { person: PersonRef | null }) {
  return person ? <Person person={person} /> : <span className="muted">Someone</span>;
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const cursor = queryValue((await searchParams).cursor);
  const unavailable = (
    <CollectionFeedback error={failure("not_found", 404)} returnTo={permalink(id)} />
  );
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))
    return unavailable;
  const collection = await serverRead<Collection>(collectionPath(id));
  if (!collection.ok)
    return <CollectionFeedback error={collection} returnTo={`/c/${id}/history`} />;
  // The API owns the capability; this only avoids a page it would refuse.
  if (!collection.data.capabilities?.canEdit) return unavailable;
  const entries = await serverRead<ActivityEntry[]>(
    withCursor(`${collectionPath(id)}/activity`, cursor),
  );
  if (!entries.ok) return <CollectionFeedback error={entries} returnTo={`/c/${id}/history`} />;
  const older = entries.meta?.nextCursor;
  return (
    <section className="reader account-flow history-page">
      <nav className="context" aria-label="Collection context">
        <a href={permalink(id)}>{collection.data.title}</a>
      </nav>
      <h1>History</h1>
      <p className="lede">Every change to this collection, newest first.</p>
      {entries.data.length ? (
        <ol className="history-list">
          {entries.data.map((entry) => (
            <li key={entry.id}>
              <span className="history-change">
                <Actor person={entry.actor} /> {sentence(entry)}
              </span>
              <span className="history-time">
                <Updated at={entry.createdAt} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p>No changes recorded yet.</p>
      )}
      {older && (
        <a className="button" href={`/c/${id}/history?cursor=${encodeURIComponent(older)}`}>
          Older changes
        </a>
      )}
    </section>
  );
}
