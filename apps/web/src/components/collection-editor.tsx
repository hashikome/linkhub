"use client";
import type { Collection } from "@linkhub/types";
import { useActionState } from "react";

export type CollectionEditState = {
  error?: string;
  latest?: Collection;
  title: string;
  description: string;
  comments: boolean;
};

// The owner's edit page: every editable field at once, one Save. A native form
// so it works without JavaScript; the server action redirects on success.
// A version conflict keeps the draft and offers the latest saved values.
export function CollectionEditForm({
  collection,
  saveAction,
}: {
  collection: Collection;
  saveAction: (previous: CollectionEditState, data: FormData) => Promise<CollectionEditState>;
}) {
  const [state, action, pending] = useActionState(
    saveAction,
    {
      title: collection.title,
      description: collection.description ?? "",
      comments: collection.commentsEnabled,
    },
    `/c/${collection.id}/edit`,
  );
  const version = state.latest?.version ?? collection.version;
  return (
    <form action={action} className="action-form edit-form" aria-busy={pending}>
      {state.error && (
        <div className="form-notice error" role="alert">
          <p>{state.error}</p>
          {state.latest && (
            <p>
              Latest saved name: <strong>{state.latest.title}</strong>.{" "}
              <a href={`/c/${collection.id}/edit`}>Start again from the latest version</a> or save
              your draft over it.
            </p>
          )}
        </div>
      )}
      <input type="hidden" name="id" value={collection.id} />
      <input type="hidden" name="version" value={version} />
      <label htmlFor="collection-title">Collection name</label>
      <input
        id="collection-title"
        name="title"
        defaultValue={state.title}
        required
        maxLength={255}
      />
      <label htmlFor="collection-description">Description</label>
      <textarea
        id="collection-description"
        name="description"
        defaultValue={state.description}
        maxLength={5000}
        rows={4}
        aria-describedby="collection-description-help"
      />
      <p id="collection-description-help" className="field-help">
        Help people understand what's in this collection at a glance.
      </p>
      <label className="edit-toggle">
        <input type="checkbox" name="comments" defaultChecked={state.comments} />
        <span>
          Allow comments
          <span className="field-help">
            Signed-in readers who can see this collection can ask questions and reply.
          </span>
        </span>
      </label>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <a className="button" href={`/c/${collection.id}`}>
          Cancel
        </a>
      </div>
    </form>
  );
}
