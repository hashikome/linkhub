"use client";
import type { Resource } from "@nslinkhub/types";
import { useActionState, useRef, useState } from "react";

type MoveAction = (previous: string, data: FormData) => Promise<string>;
export function ReorderItems({
  items,
  collectionId,
  cursor,
  moveAction,
}: {
  items: Resource[];
  collectionId: string;
  cursor?: string;
  moveAction: MoveAction;
}) {
  const [dragged, setDragged] = useState<Resource | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const [error, action, pending] = useActionState(
    moveAction,
    "",
    `/c/${collectionId}/reorder${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  return (
    <form ref={form} action={action} aria-busy={pending}>
      <input type="hidden" name="collectionId" value={collectionId} />
      <input type="hidden" name="cursor" value={cursor ?? ""} />
      <input type="hidden" name="beforeId" defaultValue="" />
      <input type="hidden" name="beforeVersion" defaultValue="" />
      <button ref={submit} type="submit" name="move" hidden tabIndex={-1}>
        Move item
      </button>
      {pending && <p role="status">Moving…</p>}
      {error && (
        <p className="form-notice error" role="alert">
          {error} <a href={`/c/${collectionId}/reorder`}>Reload order</a>
        </p>
      )}
      <ul className="reorder-list" aria-label="Item order">
        {items.map((item) => (
          <li
            key={`${item.id}:${item.version}`}
            id={`reorder-${item.id}`}
            className={`${item.kind === "heading" ? "reorder-section" : "reorder-item"}${over === item.id ? " drop-target" : ""}`}
            onDragOver={(event) => {
              if (dragged && !pending) {
                event.preventDefault();
                setOver(item.id);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (form.current && submit.current && dragged && dragged.id !== item.id && !pending) {
                (form.current.elements.namedItem("beforeId") as HTMLInputElement).value = item.id;
                (form.current.elements.namedItem("beforeVersion") as HTMLInputElement).value =
                  String(item.version);
                submit.current.value = `${dragged.id}:${dragged.version}`;
                form.current.requestSubmit(submit.current);
              }
              setDragged(null);
              setOver(null);
            }}
          >
            <div className="reorder-row">
              {/* biome-ignore lint/a11y/noStaticElementInteractions: Dragging enhances the adjacent native Move up/down buttons, usable by touch and keyboard. */}
              <span
                className="reorder-title"
                draggable={!pending}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", item.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragged(item);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setOver(null);
                }}
              >
                {item.kind === "heading" && <span className="meta">Section · </span>}
                {item.title || item.url || "Collection unavailable"}
              </span>
              <div className="reorder-buttons">
                <button
                  className="button"
                  type="submit"
                  name="move"
                  value={`${item.id}:${item.version}:up`}
                  disabled={pending}
                >
                  Move up
                </button>
                <button
                  className="button"
                  type="submit"
                  name="move"
                  value={`${item.id}:${item.version}:down`}
                  disabled={pending}
                >
                  Move down
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </form>
  );
}
