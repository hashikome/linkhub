import type { Resource } from "@ntumie/types";

// Display fields shared by persisted resources and the curated About collection.
// Static links have no invented record history or attribution.
export type ResourcePresentation = Pick<
  Resource,
  "id" | "collectionId" | "title" | "description" | "tags" | "url"
> &
  Partial<
    Pick<Resource, "createdAt" | "addedBy" | "siteName" | "linkedCollection" | "collectionHint">
  > & {
    kind: Resource["kind"] | "site_link";
  };
