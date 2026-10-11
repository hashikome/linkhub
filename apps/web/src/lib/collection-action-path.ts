import type { ManagedCollectionAction } from "@linkhub/types";
import { sharePath } from "./sharing";

/** Destination for an API-authorized action. Each destination rechecks access. */
export function collectionActionPath(
  id: string,
  action: ManagedCollectionAction,
  returnTo: string,
): string {
  const base = `/c/${id}`;
  switch (action) {
    case "open":
      return base;
    case "edit":
      return `${base}/edit`;
    case "history":
      return `${base}/history`;
    case "add_link":
      return `/capture?collection=${id}`;
    case "share":
      return sharePath({ kind: "collection", id }, returnTo);
    case "hold":
    case "release":
      return `/manage/collections/${id}`;
    default:
      return `${base}/actions?${new URLSearchParams({ action, returnTo })}`;
  }
}
