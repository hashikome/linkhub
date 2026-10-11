"use client";
import type { Resource } from "@linkhub/types";
import { useActionState } from "react";
export type SectionEditState = {
  title: string;
  description: string;
  firstItem: string;
  error?: string;
  latest?: Resource;
};
export function SectionEditor({
  collectionId,
  section,
  items,
  saveAction,
  formPath,
}: {
  collectionId: string;
  formPath: string;
  section?: Resource;
  items: Resource[];
  saveAction: (previous: SectionEditState, data: FormData) => Promise<SectionEditState>;
}) {
  const [state, action, pending] = useActionState(
    saveAction,
    {
      title: section?.title ?? "",
      description: section?.description ?? "",
      firstItem: "",
    },
    formPath,
  );
  return (
    <form action={action} className="action-form edit-form" aria-busy={pending}>
      <input type="hidden" name="collectionId" value={collectionId} />
      {section && (
        <>
          <input type="hidden" name="sectionId" value={section.id} />
          <input type="hidden" name="version" value={state.latest?.version ?? section.version} />
        </>
      )}
      {state.error && (
        <div className="form-notice error" role="alert">
          <p>{state.error}</p>
          {state.latest && (
            <p>
              {section
                ? `Review the latest saved description: ${state.latest.description || "No description."}`
                : `The selected item changed: ${state.latest.title || state.latest.url || "Linked collection"}. Review your selection before retrying.`}{" "}
              Your draft is still below.
            </p>
          )}
        </div>
      )}
      {section ? (
        <h2>{section.title}</h2>
      ) : (
        <>
          <label htmlFor="section-title">Section heading</label>
          <input
            id="section-title"
            name="title"
            required
            maxLength={255}
            defaultValue={state.title}
          />
          <label htmlFor="section-first">Start section at</label>
          <select
            id="section-first"
            name="firstItem"
            required
            key={state.firstItem}
            defaultValue={state.firstItem}
          >
            <option value="">Choose an item</option>
            {items
              .filter((item) => item.kind !== "heading")
              .map((item) => (
                <option
                  key={item.id}
                  value={`${item.id}:${state.latest?.id === item.id ? state.latest.version : item.version}`}
                >
                  {item.title || item.url || "Collection unavailable"}
                </option>
              ))}
          </select>
          <p className="field-help">
            This item and those after it belong to the new section, up to the next section heading.
            Every section needs at least one item.
          </p>
        </>
      )}
      <label htmlFor="section-description">Section description (optional)</label>
      <textarea
        id="section-description"
        name="description"
        maxLength={500}
        rows={4}
        defaultValue={state.description}
        aria-describedby="section-description-help"
      />
      <p id="section-description-help" className="field-help">
        Add context for this section. Up to 500 characters, shown below its heading.
      </p>
      <div className="form-actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Saving…" : section ? "Save description" : "Create section"}
        </button>
        <a className="button" href={`/c/${collectionId}`}>
          Cancel
        </a>
      </div>
    </form>
  );
}
