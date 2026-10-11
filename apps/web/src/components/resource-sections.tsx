"use client";
import type { Resource } from "@linkhub/types";
import { useState } from "react";
import { ResourceRow } from "./primitives";

export function ResourceSections({
  items,
  section,
  itemBase,
  collectionId,
  canEdit = false,
  selectedItem,
  preview = false,
}: {
  items: Resource[];
  preview?: boolean;
  section?: Resource;
  selectedItem?: Resource;
  itemBase?: string;
  collectionId?: string;
  canEdit?: boolean;
}) {
  const [selectedId, setSelectedId] = useState(selectedItem?.id);
  const select = (id: string, open: boolean) =>
    setSelectedId((current) => (open ? id : current === id ? undefined : current));
  const [states, setStates] = useState<Record<string, boolean>>({});
  const groups: Array<{ section?: Resource; items: Resource[] }> = [];
  let current: { section?: Resource; items: Resource[] } = { section, items: [] };
  for (const item of items) {
    if (item.kind === "heading") {
      if (current.items.length || current.section) groups.push(current);
      current = { section: item, items: [] };
    } else current.items.push(item);
  }
  if (current.items.length || current.section) groups.push(current);
  return (
    <>
      {selectedItem &&
        !items.some((item) => item.id === selectedItem.id) &&
        selectedItem.id !== section?.id && (
          <div className="linked-item">
            <p className="meta">Linked item</p>
            <ul className="resource-list">
              <ResourceRow
                key={selectedItem.id}
                item={selectedItem}
                itemBase={itemBase}
                preview={preview}
                expanded={selectedId === selectedItem.id}
                onExpandedChange={(open) => select(selectedItem.id, open)}
              />
            </ul>
          </div>
        )}
      <ul className="resource-list">
        {groups.flatMap((group) =>
          group.section
            ? [
                <li className="resource-section" key={group.section.id}>
                  <details
                    className="section-disclosure"
                    open={states[group.section.id] ?? true}
                    onToggle={(event) => {
                      const open = event.currentTarget.open;
                      if (!open) {
                        for (const item of event.currentTarget.querySelectorAll<HTMLDetailsElement>(
                          ".resource-disclosure[open]",
                        ))
                          item.open = false;
                      }
                      const id = group.section?.id;
                      if (id)
                        setStates((current) =>
                          current[id] === open ? current : { ...current, [id]: open },
                        );
                    }}
                  >
                    <summary aria-labelledby={`section-title-${group.section.id}`}>
                      <h2 id={`section-title-${group.section.id}`}>{group.section.title}</h2>
                      {group.section.description && (
                        <p className="section-description">{group.section.description}</p>
                      )}
                      <span className="section-expand-hint">Show items</span>
                    </summary>
                    <ul className="resource-list">
                      {group.items.map((item) => (
                        <ResourceRow
                          key={item.id}
                          item={item}
                          itemBase={itemBase}
                          preview={preview}
                          expanded={item.id === selectedId}
                          onExpandedChange={(open) => select(item.id, open)}
                        />
                      ))}
                    </ul>
                  </details>
                  {canEdit && collectionId && (
                    <a
                      className="section-edit"
                      href={`/c/${collectionId}/sections?section=${group.section.id}`}
                    >
                      Edit section description
                    </a>
                  )}
                </li>,
              ]
            : group.items.map((item) => (
                <ResourceRow
                  key={item.id}
                  item={item}
                  itemBase={itemBase}
                  preview={preview}
                  expanded={item.id === selectedId}
                  onExpandedChange={(open) => select(item.id, open)}
                />
              )),
        )}
      </ul>
    </>
  );
}
