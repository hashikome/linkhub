"use client";
import { type ReactNode, useEffect, useRef } from "react";

export function ItemDisclosure({
  children,
  expanded,
  itemId,
  collectionId,
  onExpandedChange,
}: {
  children: ReactNode;
  expanded: boolean;
  itemId: string;
  collectionId: string;
  onExpandedChange?: (open: boolean) => void;
}) {
  const element = useRef<HTMLDetailsElement>(null);
  // Only a directly opened/mounted selection scrolls; ordinary clicks stay put.
  // biome-ignore lint/correctness/useExhaustiveDependencies: This is initial document selection, not every user toggle.
  useEffect(() => {
    if (expanded) element.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: The native summary provides Enter/Space toggling; body clicks extend its pointer target.
    <details
      ref={element}
      name={`collection-${collectionId}-items`}
      className="resource-disclosure"
      open={expanded}
      onToggle={(event) => {
        onExpandedChange?.(event.currentTarget.open);
        const url = new URL(window.location.href);
        if (event.currentTarget.open) url.searchParams.set("item", itemId);
        else if (url.searchParams.get("item") === itemId) url.searchParams.delete("item");
        else return;
        if (url.hash.startsWith("#item-")) url.hash = "";
        window.history.replaceState(window.history.state, "", url);
      }}
      onClick={(event) => {
        const target = event.target;
        // Summary already has native mouse/keyboard toggling. Links and selected
        // text inside the body must remain usable without closing the item.
        if (
          !(target instanceof Element) ||
          target.closest("summary, a, button, input, select, textarea, [contenteditable]") ||
          window.getSelection()?.toString()
        )
          return;
        event.currentTarget.open = !event.currentTarget.open;
      }}
    >
      {children}
    </details>
  );
}
