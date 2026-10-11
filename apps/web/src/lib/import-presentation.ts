import type { ImportRowStatus } from "@linkhub/types";

export const importStatusLabels: Record<ImportRowStatus, string> = {
  looking_up: "Processing",
  ready: "Ready",
  failed: "Needs attention",
  duplicate: "Duplicate",
  already_saved: "Already saved",
  imported: "Imported",
  skipped: "Skipped",
};

export const importReasons: Record<string, string> = {
  collection_required:
    "Choose a collection for this link. Its browser folder does not supply a name.",
  url_too_long: "Shorten the address to 2,048 characters.",
  invalid_address: "Use a public https:// or http:// address without credentials or a custom port.",
  invalid_or_private_address: "Check the address. It must point to a public website.",
  destination_unavailable: "Choose another collection; this destination is no longer available.",
  unreachable: "We couldn’t reach this page. Check the address or retry the lookup.",
};
