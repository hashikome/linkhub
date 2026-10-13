import type { PersonProfile as PersonProfileData } from "@ntumie/types";
import { notFound } from "next/navigation";
import { type ApiPath, withCursor } from "../lib/http";
import { readShared } from "../lib/server-api";
import { readSession } from "../lib/session";
import { Avatar } from "./avatar";
import { Feedback } from "./feedback";
import { FormNotice } from "./form-notice";
import { NativeForm } from "./native-form";
import { CollectionRow } from "./primitives";
import { ShareAction } from "./share-action";
import { ShareOpen } from "./share-open";

export async function PersonProfile({
  username,
  userId,
  cursor,
  notice,
  shareId,
}: {
  username?: string;
  userId?: string;
  cursor?: string;
  notice?: string;
  shareId?: string;
}) {
  const profilePath = userId ? `/people/${userId}` : `/${encodeURIComponent(username ?? "")}`;
  const apiPath: ApiPath = userId
    ? `/api/v1/people/${userId}`
    : `/api/v1/people/by-username/${encodeURIComponent(username ?? "")}`;
  const returnTo = `${profilePath}${cursor ? `?${new URLSearchParams({ cursor })}` : ""}`;
  const [result, session] = await Promise.all([
    readShared<PersonProfileData>(withCursor(apiPath, cursor)),
    readSession(),
  ]);
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) return <Feedback error={result} resetPath={profilePath} />;
  const { person, hub, collections } = result.data;
  const own = session?.userId === person.userId;
  const name = person.name;
  return (
    <section className="reader collection-browser" data-reader>
      <ShareOpen shareId={shareId} kind="profile" resourceId={person.userId} />
      <div className="page-heading shareable-heading">
        <div>
          <div className="person-picture">
            <Avatar userId={person.userId} large />
          </div>
          <h1>{name || person.username}</h1>
          {(name || hub) && (
            <p className="hub-identity meta">
              <span>{person.username}</span>
              {hub && (
                <>
                  {" "}
                  of{" "}
                  <a className="person-name" href={`/h/${hub.id}`}>
                    {hub.name}
                  </a>
                </>
              )}
            </p>
          )}
          {person.bio && <p className="person-bio">{person.bio}</p>}
        </div>
        <ShareAction target={{ kind: "profile", id: person.userId }} returnTo={returnTo} />
      </div>
      {own && <FormNotice code={notice} />}
      {own && !session.hubId && (
        <div className="profile-create-hub">
          <p>Create a hub to keep your collections in one place.</p>
          <NativeForm action="/forms/create-hub">
            <button type="submit" className="button">
              Create hub
            </button>
          </NativeForm>
        </div>
      )}
      <h2>Public contributions</h2>
      {collections.length ? (
        <ul className="collection-list">
          {collections.map((item) => (
            <CollectionRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="meta">No public contributions yet.</p>
      )}
      {result.meta?.nextCursor && (
        <a
          className="button"
          href={`${profilePath}?cursor=${encodeURIComponent(result.meta.nextCursor)}`}
        >
          More contributions
        </a>
      )}
    </section>
  );
}
