import type {
  ImportCollectionView,
  ImportDraftView,
  ImportFolderView,
  ImportRowStatus,
  ImportRowView,
  ImportSourceKind,
} from "@linkhub/types";
import { appError } from "../../common/errors/app-exception";
import type { ImportDraft, ImportFolder, ImportRow, Prisma } from "../../generated/prisma/client";

type Db = Pick<Prisma.TransactionClient, "linkMetadata" | "resource" | "collection">;
export type LoadedDraft = ImportDraft & { folders: ImportFolder[]; rows: ImportRow[] };
export function destination(folder: ImportFolder, folders: ImportFolder[]): ImportFolder | null {
  let current: ImportFolder | undefined = folder;
  for (let i = 0; i <= folders.length; i++) {
    if (!current) return null;
    if (current.mode === "collection") return current;
    current = folders.find((f) => f.id === current?.parentId);
  }
  throw appError("invalid_import");
}
export async function importState(db: Db, draft: LoadedDraft) {
  const urls = [...new Set(draft.rows.flatMap((r) => (r.url ? [r.url] : [])))];
  const ids = [
    ...new Set(draft.folders.flatMap((f) => (f.targetCollectionId ? [f.targetCollectionId] : []))),
  ];
  const [metadata, existing, targets, receipts] = await Promise.all([
    db.linkMetadata.findMany({ where: { url: { in: urls } } }),
    db.resource.findMany({
      where: { collectionId: { in: ids }, collection: { hubId: draft.hubId }, url: { in: urls } },
      select: { collectionId: true, url: true },
    }),
    db.collection.findMany({
      where: { id: { in: ids }, hubId: draft.hubId },
      select: { id: true, title: true, published: true },
    }),
    db.resource.findMany({
      where: {
        id: { in: draft.rows.flatMap((r) => (r.resourceId ? [r.resourceId] : [])) },
        collection: { hubId: draft.hubId },
      },
      select: {
        id: true,
        position: true,
        collectionId: true,
        collection: { select: { title: true } },
      },
    }),
  ]);
  const headings = receipts.length
    ? await db.resource.findMany({
        where: {
          collectionId: { in: [...new Set(receipts.map((r) => r.collectionId))] },
          collection: { hubId: draft.hubId },
          kind: "heading",
        },
        select: { collectionId: true, position: true, titleOverride: true },
        orderBy: { position: "desc" },
      })
    : [];
  const meta = new Map(metadata.map((m) => [m.url, m]));
  const saved = new Set(existing.map((r) => `${r.collectionId}:${r.url}`));
  const valid = new Set(targets.map((c) => c.id));
  const unavailable = (folder: ImportFolder): boolean => {
    let current: ImportFolder | undefined = folder;
    while (current) {
      if (current.targetCollectionId && !valid.has(current.targetCollectionId)) return true;
      if (draft.sourceKind !== "bookmarks" || current.manual || current.referenceId) break;
      const parent = draft.folders.find((f) => f.id === current?.parentId);
      current = parent?.parentId ? parent : undefined;
    }
    return false;
  };
  const seen = new Set<string>();
  const counts: Record<ImportRowStatus, number> = {
    looking_up: 0,
    ready: 0,
    failed: 0,
    duplicate: 0,
    already_saved: 0,
    imported: 0,
    skipped: 0,
  };
  const rows: ImportRowView[] = draft.rows.map((row) => {
    const folder = draft.folders.find((f) => f.id === row.folderId);
    if (!folder) throw appError("invalid_import");
    const target = destination(folder, draft.folders);
    const page = row.url ? meta.get(row.url) : undefined;
    let status: ImportRowStatus = "looking_up",
      reason: string | null = null;
    const key = `${target?.targetCollectionId ?? target?.id}:${row.url}`;
    if (row.resourceId) status = "imported";
    else if (row.dropped || !target) status = "skipped";
    else if (unavailable(target)) {
      status = "failed";
      reason = "destination_unavailable";
    } else if (!target.newTitle.trim()) {
      status = "failed";
      reason = "collection_required";
    } else if (row.failure || !row.url) {
      status = "failed";
      reason = row.failure ?? "invalid_address";
    } else if (saved.has(`${target.targetCollectionId}:${row.url}`)) status = "already_saved";
    else if (seen.has(key)) status = "duplicate";
    else {
      seen.add(key);
      if (page?.state === "ready") status = "ready";
      else if (page?.state === "failed" || (page && page.attempts > 0 && !page.leaseToken)) {
        status = "failed";
        reason = "unreachable";
      }
    }
    counts[status]++;
    const receipt = receipts.find((r) => r.id === row.resourceId);
    const savedSection = receipt
      ? (headings.find(
          (h) => h.collectionId === receipt.collectionId && h.position < receipt.position,
        )?.titleOverride ?? "")
      : "";
    return {
      id: row.id,
      folderId: row.folderId,
      position: row.position,
      sourceLocation: row.sourceLocation,
      collectionTitle: row.resourceId
        ? (receipt?.collection.title ?? "No longer available")
        : (targets.find((c) => c.id === target?.targetCollectionId)?.title ??
          target?.newTitle ??
          ""),
      collectionKey: target?.id ?? null,
      sectionTitle: row.resourceId ? savedSection : folder.mode === "section" ? folder.name : "",
      targetCollectionId: row.resourceId
        ? (receipt?.collectionId ?? null)
        : (target?.targetCollectionId ?? null),
      address: row.address,
      url: row.url,
      tags: row.tags,
      title: page?.title ?? null,
      status,
      reason,
      resourceId: row.resourceId,
    };
  });
  const view: ImportDraftView = {
    id: draft.id,
    version: draft.version,
    sourceKind: draft.sourceKind as ImportSourceKind,
    closed: draft.closed,
    createdAt: draft.createdAt.toISOString(),
    expiresAt: draft.expiresAt.toISOString(),
    counts,
    unassignedCount: draft.rows.filter(
      (r) =>
        !r.resourceId &&
        !r.dropped &&
        draft.folders.some((f) => f.id === r.folderId && !f.parentId && !f.newTitle),
    ).length,
    collections: draft.folders
      .filter((f) => f.mode === "collection" && f.jobState !== "discarded")
      .map((folder) => {
        const group = rows.filter((r) => r.collectionKey === folder.id);
        const groupCounts = Object.fromEntries(
          Object.keys(counts).map((key) => [key, 0]),
        ) as Record<ImportRowStatus, number>;
        for (const row of group) groupCounts[row.status]++;
        return {
          id: folder.id,
          published:
            targets.find((c) => c.id === folder.targetCollectionId)?.published ?? folder.published,
          title: targets.find((c) => c.id === folder.targetCollectionId)?.title ?? folder.newTitle,
          counts: groupCounts,
          references: draft.folders
            .filter(
              (child) =>
                child.parentId === folder.id &&
                child.mode === "collection" &&
                child.jobState !== "discarded",
            )
            .map((child) => ({ id: child.id, title: child.newTitle, saved: !!child.referenceId })),
          saved: !!folder.targetCollectionId,
          targetCollectionId: folder.targetCollectionId,
          jobState: folder.jobState as ImportCollectionView["jobState"],
        };
      })
      .filter(
        (c) => Object.values(c.counts).some((n) => n > 0) || (!!c.title && c.references.length > 0),
      ),
    folders: draft.folders.map((f) => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      path: f.path,
      position: f.position,
      mode: f.mode as ImportFolderView["mode"],
      targetCollectionId: f.targetCollectionId,
      newTitle: f.newTitle,
      manual: f.manual,
    })),
  };
  return { view, rows };
}
