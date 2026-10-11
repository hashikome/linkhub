export const importSourceKinds = ["csv", "bookmarks", "text"] as const;
export type ImportSourceKind = (typeof importSourceKinds)[number];
export const importRowStatuses = [
  "looking_up",
  "ready",
  "failed",
  "duplicate",
  "already_saved",
  "imported",
  "skipped",
] as const;
export type ImportRowStatus = (typeof importRowStatuses)[number];
export interface ImportCreateRequest {
  sourceKind: ImportSourceKind;
}
export interface ImportRevision {
  version: number;
}
export interface ImportRowUpdate extends ImportRevision {
  address?: string;
  collectionTitle?: string;
  sectionTitle?: string;
  tags?: string[];
}
export interface ImportDestinationUpdate extends ImportRevision {
  collectionTitle: string;
}
export interface ImportFolderView {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  position: number;
  mode: "collection" | "section";
  targetCollectionId: string | null;
  newTitle: string;
  manual: boolean;
}
export interface ImportRowView {
  id: string;
  folderId: string;
  position: number;
  sourceLocation: string;
  collectionTitle: string;
  collectionKey: string | null;
  sectionTitle: string;
  targetCollectionId: string | null;
  address: string;
  url: string | null;
  tags: string[];
  title: string | null;
  status: ImportRowStatus;
  reason: string | null;
  resourceId: string | null;
}
export interface ImportCollectionUpdate extends ImportRevision {
  published: boolean;
}
export interface ImportCollectionView {
  published: boolean;
  id: string;
  title: string;
  counts: Record<ImportRowStatus, number>;
  references: { id: string; title: string; saved: boolean }[];
  saved: boolean;
  targetCollectionId: string | null;
  jobState: "review" | "queued" | "running" | "completed" | "failed";
}
export interface ImportDraftView {
  id: string;
  version: number;
  sourceKind: ImportSourceKind;
  closed: boolean;
  unassignedCount: number;
  createdAt: string;
  expiresAt: string;
  folders: ImportFolderView[];
  collections: ImportCollectionView[];
  collectionId?: string;
  collectionTitle?: string;
  counts: Record<ImportRowStatus, number>;
}
export interface ImportCommitResult {
  importedCount: number;
  destinations: { collectionId: string; importedCount: number }[];
  draft: ImportDraftView;
}

export interface ImportSelectionRequest extends ImportRevision {
  rowIds: string[];
  action: "revalidate" | "remove" | "place";
  collectionTitle?: string;
}
export interface ImportSelectionResult {
  draft: ImportDraftView;
  rows: ImportRowView[];
}
