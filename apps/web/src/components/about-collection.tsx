import { CollectionPreview } from "./collection-preview";
import type { ResourcePresentation } from "./resource-presentation";

const items: ResourcePresentation[] = [
  {
    id: "help-and-people",
    collectionId: "about",
    kind: "heading",
    title: "Help and the person behind it",
    description: "Find a little help, or get to know who is building ntumie.",
    tags: [],
  },
  {
    id: "support",
    collectionId: "about",
    kind: "site_link",
    title: "Support",
    url: "/support",
    tags: [],
    description:
      "Find help with your account, signing in, importing bookmarks and keeping your links together.",
  },
  {
    id: "maker",
    collectionId: "about",
    kind: "external_link",
    title: "Meet the maker — Paul John",
    url: "https://namestarlit.com",
    tags: [],
    description: "Explore the projects and notes of namestarlit, the person building ntumie.",
  },
];

export function AboutCollection() {
  return (
    <CollectionPreview
      context="About ntumie."
      title="A few useful links"
      description="Support and a connection to the person behind the product."
      items={items}
      selectedItem={items[1]}
      itemBase={null}
    />
  );
}
