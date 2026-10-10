import type { Collection, Resource } from "@nslinkhub/types";
import { CollectionMeta, Tags } from "./primitives";
import { ResourceSections } from "./resource-sections";

// Fictional, presentation-only data. Preview mode keeps its identities off
// record routes. Titles open resources; copied item links select this demo.
export function CollectionExample({ selectedItemId }: { selectedItemId?: string }) {
  // Stable sample history: age labels progress naturally instead of resetting.
  const updatedAt = "2026-10-08T10:00:00.000Z";
  const ada = { userId: "019a0000-0000-7000-8000-000000000001", username: "ada" };
  const collection: Collection = {
    id: "019a0000-0000-7000-8000-000000000002",
    hubId: "019a0000-0000-7000-8000-000000000003",
    hub: {
      id: "019a0000-0000-7000-8000-000000000003",
      name: "Ada's reading shelf",
      handle: "ada-reads",
      owner: ada,
    },
    creator: ada,
    slug: "a-web-worth-keeping",
    title: "A web worth keeping",
    description: "A few good reads on collecting, organizing, and sharing what you find.",
    tags: ["curation", "knowledge"],
    published: true,
    linkSharingEnabled: false,
    commentsEnabled: true,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
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
    <figure className="collection-example collection-sheet" aria-label="Example collection">
      <div className="sheet-bar">
        <span className="context">{collection.hub?.name}</span>
        <span className="example-badge">Example</span>
      </div>
      <div className="page-heading">
        <h2>{collection.title}</h2>
        <p className="description">{collection.description}</p>
        <Tags tags={collection.tags} limit={3} />
        <CollectionMeta item={collection} preview />
      </div>
      <ResourceSections
        items={items}
        selectedItem={
          items.find((item) => item.id === selectedItemId && item.kind !== "heading") ?? items[1]
        }
        preview
      />
      <figcaption className="sr-only">
        Example collection. Click a section heading to show or hide its links. Click a link title to
        visit the resource, or the space around it to show its details.
      </figcaption>
    </figure>
  );
}
