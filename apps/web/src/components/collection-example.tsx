import type { Collection, Resource } from "@ntumie/types";
import { CollectionPreview } from "./collection-preview";
import { CollectionMeta } from "./primitives";

// Fictional, presentation-only data. Preview mode keeps its identities off
// record routes. Titles open resources; copied item links select this demo.
export function CollectionExample({ selectedItemId }: { selectedItemId?: string }) {
  // Stable sample history: age labels progress naturally instead of resetting.
  const updatedAt = "2026-10-08T10:00:00.000Z";
  const ada = { userId: "019a0000-0000-7000-8000-000000000001", username: "ada" };
  const collection = {
    id: "019a0000-0000-7000-8000-000000000002",
    hubId: "019a0000-0000-7000-8000-000000000003",
    hub: {
      id: "019a0000-0000-7000-8000-000000000003",
      name: "Ada's reading shelf",
      handle: "ada-reads",
      owner: ada,
    },
    creator: ada,
    title: "A web worth keeping",
    description: "A few good reads on collecting, organizing, and sharing what you find.",
    tags: ["curation", "knowledge"],
    published: true,
    linkSharingEnabled: false,
    commentsEnabled: true,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  } satisfies Collection;
  const common = {
    collectionId: collection.id,
    linkedCollectionId: null,
    siteName: null,
    addedBy: ada,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
  const items: Resource[] = [
    {
      ...common,
      id: "019a0000-0000-7000-8000-000000000004",
      kind: "heading",
      title: "From good finds to useful guides",
      description: "Give your collection a purpose, then let it grow.",
      tags: [],
      position: 0,
    },
    {
      ...common,
      id: "019a0000-0000-7000-8000-000000000005",
      kind: "external_link",
      url: "https://fortelabs.com/blog/organize-your-bookmarks-with-the-para-method-for-lightning-fast-web-browsing/",
      title: "Organize Your Bookmarks with the PARA Method for Lightning Fast Web Browsing",
      description:
        "Group your finds around projects and interests so the right resource is easier to reach.",
      tags: ["curation"],
      position: 1,
    },
    {
      ...common,
      id: "019a0000-0000-7000-8000-000000000006",
      kind: "external_link",
      url: "https://maggieappleton.com/garden-history",
      title: "A Brief History & Ethos of the Digital Garden",
      description:
        "Explore how a personal collection of knowledge can grow, connect ideas, and be shared with others.",
      tags: ["curation", "knowledge"],
      position: 2,
    },
  ];
  return (
    <CollectionPreview
      context={collection.hub.name}
      title={collection.title}
      description={collection.description}
      tags={collection.tags}
      metadata={<CollectionMeta item={collection} preview />}
      example
      items={items}
      selectedItem={
        items.find((item) => item.id === selectedItemId && item.kind !== "heading") ?? items[1]
      }
    />
  );
}
