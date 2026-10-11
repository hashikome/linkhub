"use client";
import { maxTagLength as maxLength, maxTags } from "@linkhub/types";
import { useEffect, useRef, useState } from "react";
import { splitTags as split } from "../lib/validation";

// Tags typed as chips: Enter or a comma adds one, × or Backspace in the empty
// field removes one, and a tag over 80 characters stays as text with a note
// rather than becoming a chip. The form still submits one comma-separated
// "tags" value (the format imports and the API use), including a tag still
// being typed. It starts as an "Add tags" button (after any existing tags,
// shown as plain pills) and becomes the chip field only while editing. Without
// JavaScript (and before hydration) the same button is a native disclosure
// around a comma-separated field. Used wherever tags are edited.
export function TagInput({ id, initial }: { id: string; initial: string }) {
  const [tags, setTags] = useState(() =>
    split(initial)
      .filter((tag) => tag.length <= maxLength)
      .slice(0, maxTags),
  );
  const [draft, setDraft] = useState(() =>
    split(initial)
      .filter((tag) => tag.length > maxLength)
      .join(", "),
  );
  const [enhanced, setEnhanced] = useState(false);
  // A tag returned too long (e.g. after a failed save) reopens the field.
  const [open, setOpen] = useState(() => draft !== "");
  const field = useRef<HTMLInputElement>(null);
  const pressing = useRef(false);
  const plain = useRef<HTMLInputElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const preserveDraft = useRef(false);
  const selection = useRef<{ start: number | null; end: number | null } | null>(null);
  useEffect(() => {
    const input = plain.current;
    if (input) {
      const focused = document.activeElement === input;
      const parts = split(input.value);
      preserveDraft.current = focused && input.value.includes(",");
      // If someone is still typing, keep their literal draft and caret instead
      // of converting the field underneath them. Blur/Enter can commit it later.
      setTags(focused ? [] : parts.filter((tag) => tag.length <= maxLength).slice(0, maxTags));
      setDraft(focused ? input.value : parts.filter((tag) => tag.length > maxLength).join(", "));
      setOpen(
        focused ||
          Boolean(disclosure.current?.open && !input.defaultValue) ||
          parts.some((tag) => tag.length > maxLength),
      );
      if (focused) selection.current = { start: input.selectionStart, end: input.selectionEnd };
    }
    setEnhanced(true);
  }, []);
  const wasEnhanced = useRef(false);
  useEffect(() => {
    if (!enhanced) return;
    // Preserve focus only when it was in the native editor; mounting another
    // editor must not steal focus from the URL, destination or Save button.
    if (open && (wasEnhanced.current || selection.current)) field.current?.focus();
    if (selection.current) {
      field.current?.setSelectionRange(selection.current.start, selection.current.end);
      selection.current = null;
    }
    wasEnhanced.current = true;
  }, [open, enhanced]);
  // Only an open field needs to know whether a pointer press is under way.
  useEffect(() => {
    if (!open) return;
    const down = () => {
      pressing.current = true;
    };
    const up = () => {
      pressing.current = false;
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    return () => {
      pressing.current = false;
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
    };
  }, [open]);

  const tooLong = split(draft).some((tag) => tag.length > maxLength);
  function commit(value: string) {
    preserveDraft.current = false;
    const parts = split(value);
    const fits = parts.filter(
      (tag) => tag.length <= maxLength && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
    );
    if (fits.length) setTags((current) => [...current, ...fits].slice(0, maxTags));
    setDraft(parts.filter((tag) => tag.length > maxLength).join(", "));
  }

  if (!enhanced)
    return (
      <details ref={disclosure} className="tag-field-plain" open={Boolean(initial)}>
        <summary className="text-button tag-add">
          <span aria-hidden="true">+</span> Add tags
        </summary>
        <label htmlFor={id}>Tags</label>
        <input
          id={id}
          name="tags"
          maxLength={2430}
          ref={plain}
          defaultValue={initial}
          placeholder="Separated by commas"
        />
      </details>
    );

  const value = <input type="hidden" name="tags" value={[...tags, ...split(draft)].join(", ")} />;
  if (!open)
    return (
      <div className="tag-summary">
        {tags.length > 0 && (
          <ul className="tags" aria-label="Tags added">
            {tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        <button type="button" className="text-button tag-add" onClick={() => setOpen(true)}>
          <span aria-hidden="true">+</span> Add tags
        </button>
        {value}
      </div>
    );
  return (
    <>
      <label htmlFor={id}>Tags</label>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Clicking the box's padding focuses its text input; keyboard users reach the input directly. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: As above; the input itself handles keys. */}
      <div
        className="tag-input"
        onClick={() => field.current?.focus()}
        onBlur={(event) => {
          // Leaving the box (not moving between its chips) finishes editing. When
          // a press elsewhere caused it, collapse only after that click lands, so
          // the shrinking field never moves the target out from under the pointer.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          const finish = () => {
            commit(draft);
            setOpen(false);
          };
          if (!pressing.current) return finish();
          document.addEventListener("click", () => setTimeout(finish, 0), {
            once: true,
            capture: true,
          });
        }}
      >
        {tags.length > 0 && (
          <ul className="tag-chips" aria-label="Tags added">
            {tags.map((tag) => (
              <li key={tag} className="tag-chip">
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTags((current) => current.filter((t) => t !== tag));
                    field.current?.focus();
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id={id}
          ref={field}
          value={draft}
          onChange={(event) => {
            const next = event.target.value;
            // An adopted comma-separated draft stays editable until an explicit
            // commit; its old commas must not commit the next typed character.
            if (next.includes(",") && !preserveDraft.current) commit(next);
            else setDraft(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || (event.key === "," && preserveDraft.current)) {
              event.preventDefault();
              commit(draft);
            } else if (event.key === "Escape") {
              commit(draft);
              setOpen(false);
            } else if (event.key === "Backspace" && !draft && tags.length) {
              setTags((current) => current.slice(0, -1));
            }
          }}
          aria-invalid={tooLong || undefined}
          aria-describedby={tooLong ? `${id}-long` : undefined}
          placeholder={tags.length ? "Add another" : "Type a tag, then press Enter"}
        />
      </div>
      {tooLong && (
        <p className="tag-note" id={`${id}-long`}>
          Tags can be up to {maxLength} characters.
        </p>
      )}
      {value}
    </>
  );
}
