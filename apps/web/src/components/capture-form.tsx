import { randomUUID } from "node:crypto";
import type { Collection, Profile } from "@nslinkhub/types";
import type { CaptureDraft } from "../lib/capture-draft";
import { queryValue, withCursor } from "../lib/http";
import { serverRead } from "../lib/server-api";
import { relativeTime } from "../lib/time";
import { isUuid } from "../lib/validation";
import { CaptureLinks } from "./capture-links";
import { Feedback } from "./feedback";
import { FormNotice } from "./form-notice";
import { NativeForm } from "./native-form";

const shortDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
// Matches the API's default: "Saved links, Oct 7", then "(2)", "(3)" … so a
// suggested name never repeats one in the list. Typed names may repeat.
function suggestedName(collections: Collection[]) {
  const base = `Saved links, ${shortDate.format(new Date())}`;
  const taken = new Set(collections.map((c) => c.title));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
}

export async function CaptureForm({
  draft,
  query,
}: {
  draft?: CaptureDraft;
  query: Record<string, string | string[] | undefined>;
}) {
  const profile = await serverRead<Profile>("/api/v1/profile");
  if (!profile.ok && profile.status !== 401)
    return <Feedback error={profile} resetPath="/capture" />;
  const choices =
    profile.ok && profile.data.hubId
      ? await serverRead<Collection[]>(
          withCursor(`/api/v1/hubs/${profile.data.hubId}/collections`, queryValue(query.cursor)),
        )
      : null;
  if (choices && !choices.ok)
    return <Feedback error={choices} resetPath={draft ? `/capture/${draft.id}` : "/capture"} />;
  const collections = choices?.ok ? choices.data : [];
  const target = queryValue(query.collection);
  const selected = draft?.destination ?? (isUuid(target) ? target : "");
  if (profile.ok && isUuid(selected) && !collections.some((c) => c.id === selected)) {
    const targetCollection = await serverRead<Collection>(`/api/v1/collections/${selected}`);
    if (targetCollection.ok && targetCollection.data.capabilities?.canManage)
      collections.unshift(targetCollection.data);
  }
  const id = draft?.id ?? randomUUID();
  return (
    <section className="reader account-flow capture-page" data-reader>
      <h1>{profile.ok ? "Save a link" : "Save your first link"}</h1>
      <p>
        {profile.ok
          ? "Keep useful links together in one of your collections."
          : "Start with a useful link. Your first collection will be private."}
      </p>
      <FormNotice code={queryValue(query.notice)} />
      <NativeForm action="/forms/capture-save">
        <input type="hidden" name="draftId" value={id} />
        <CaptureLinks initial={draft?.links ?? []}>
          {!profile.ok && (
            <p className="meta">
              Next, verify your email to save. No name or collection title needed.
            </p>
          )}
          {collections.length > 0 || query.cursor ? (
            <>
              <label htmlFor="destination">Save to</label>
              <select
                id="destination"
                name="destination"
                required
                defaultValue={selected === "first" ? "" : selected}
              >
                <option value="" disabled>
                  Choose a collection
                </option>
                <option value="new">New private collection</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} · updated{" "}
                    {relativeTime(
                      c.updatedAt,
                      profile.ok ? (profile.data.timeZone ?? "UTC") : "UTC",
                    )}
                    {c.published
                      ? " · Published"
                      : c.linkSharingEnabled
                        ? " · Sharing may apply"
                        : ""}
                  </option>
                ))}
              </select>
              <p className="meta">Links follow the chosen collection's sharing settings.</p>
              {/* Shown by CSS only while "New private collection" is chosen. */}
              <div className="capture-new-name">
                <label htmlFor="collectionTitle">Name for the new collection</label>
                <input
                  id="collectionTitle"
                  name="collectionTitle"
                  maxLength={255}
                  defaultValue={draft?.collectionTitle ?? suggestedName(collections)}
                />
              </div>
            </>
          ) : (
            <input
              type="hidden"
              name="destination"
              value={draft?.destination === "new" ? "new" : "first"}
            />
          )}
        </CaptureLinks>
      </NativeForm>
      {choices?.ok && choices.meta?.nextCursor && (
        <a href={`?${new URLSearchParams({ cursor: choices.meta.nextCursor })}`}>
          More destinations
        </a>
      )}
      <p>
        <a
          href={
            profile.ok
              ? profile.data.hubId
                ? `/h/${profile.data.hubId}`
                : `/${profile.data.username}`
              : "/discover"
          }
        >
          {profile.ok
            ? profile.data.hubId
              ? "Back to your hub"
              : "Back to your profile"
            : "Discover collections"}
        </a>
      </p>
    </section>
  );
}
