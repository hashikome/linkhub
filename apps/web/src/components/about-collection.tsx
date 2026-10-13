import { aboutItems, aboutCollection as collection } from "../lib/about-collection-snapshot";
import { CollectionPreview } from "./collection-preview";
import { CollectionMeta } from "./primitives";
import type { ResourcePresentation } from "./resource-presentation";

// Keep Support on the current installation, including local development.
const items: ResourcePresentation[] = aboutItems.map((item) =>
  item.url === "https://ntumie.link/support"
    ? { ...item, kind: "site_link", url: "/support" }
    : item,
);

export function AboutCollection({ selectedItemId }: { selectedItemId?: string }) {
  const selected =
    selectedItemId === "support"
      ? items[1]
      : selectedItemId === "maker"
        ? items[2]
        : items.find((item) => item.id === selectedItemId && item.kind !== "heading");
  return (
    <CollectionPreview
      context={collection.hub.name}
      title={collection.title}
      description={collection.description}
      tags={collection.tags}
      metadata={<CollectionMeta item={collection} preview />}
      items={items}
      selectedItem={selected ?? items[1]}
      itemBase="/about"
    />
  );
}
