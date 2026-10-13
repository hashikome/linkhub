import type { Collection, Resource } from "@ntumie/types";

// Presentation-only fixture, exactly like the homepage's Ada collection.
// All identities and activity are simulated; no account, hub or API record is
// required. The owner chose namestarlit as the displayed contributor. Dates stay
// fixed so relative ages progress naturally instead of resetting on each render.
const createdAt = "2026-10-12T02:58:20.000Z";
const updatedAt = "2026-10-12T23:33:31.000Z";
const curator = {
  userId: "019a0000-0000-7000-8000-000000000011",
  username: "namestarlit",
};

export const aboutCollection = {
  id: "019a0000-0000-7000-8000-000000000012",
  hubId: "019a0000-0000-7000-8000-000000000013",
  hub: {
    id: "019a0000-0000-7000-8000-000000000013",
    name: "ntumie.",
    handle: "ntumie",
    owner: curator,
  },
  creator: curator,
  title: "A few useful links",
  description: "Find help with ntumie. and meet the person building it.",
  tags: ["help", "portfolio"],
  published: true,
  linkSharingEnabled: false,
  commentsEnabled: false,
  version: 1,
  createdAt,
  updatedAt,
} satisfies Collection;

const common = {
  collectionId: aboutCollection.id,
  linkedCollectionId: null,
  siteName: null,
  addedBy: curator,
  version: 1,
  createdAt,
  updatedAt,
};

export const aboutItems: Resource[] = [
  {
    ...common,
    id: "019a0000-0000-7000-8000-000000000014",
    kind: "heading",
    title: "Help and the maker",
    description: "Find a little help, or get to know who is building ntumie.",
    tags: [],
    position: 0,
  },
  {
    ...common,
    id: "019a0000-0000-7000-8000-000000000015",
    kind: "external_link",
    title: "Support",
    url: "https://ntumie.link/support",
    tags: ["help"],
    description:
      "Find help with your account, signing in, importing bookmarks and keeping your links together.",
    position: 1,
  },
  {
    ...common,
    id: "019a0000-0000-7000-8000-000000000016",
    kind: "external_link",
    title: "Meet the maker — Paul John",
    url: "https://namestarlit.com",
    tags: ["portfolio"],
    description: "Explore the projects and notes of namestarlit, the person building ntumie.",
    position: 2,
  },
];
