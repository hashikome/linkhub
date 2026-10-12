import { createHash } from "node:crypto";
import type { CollectionImpact } from "@ntumie/types";
import { recordAudit } from "../../common/audit";
import { appError } from "../../common/errors/app-exception";
import type { Collection, Prisma } from "../../generated/prisma/client";

// Run under the authority transaction for both preview and mutation. Only rows
// owned by the current collection owner can be removed by this operation.
export async function collectionImpact(
  tx: Prisma.TransactionClient,
  collection: Collection,
  action: "delete" | "transfer",
) {
  const references = await tx.resource.findMany({
    where: {
      kind: "collection_link",
      collection: { hubId: collection.hubId },
      OR: [
        { linkedCollectionId: collection.id, collectionId: { not: collection.id } },
        ...(action === "transfer" ? [{ collectionId: collection.id }] : []),
      ],
    },
    orderBy: { id: "asc" },
  });
  const affected = await tx.collection.findMany({
    where: {
      id: { in: [...new Set(references.map((r) => r.collectionId))] },
      hubId: collection.hubId,
    },
    include: { resources: { orderBy: { position: "asc" } } },
    orderBy: { id: "asc" },
  });
  const remove = new Set(references.map((r) => r.id));
  const groups = affected.map((source) => {
    const headings: { id: string; title: string }[] = [];
    source.resources.forEach((row, index) => {
      if (row.kind !== "heading") return;
      const following = source.resources.slice(index + 1);
      const next = following.findIndex((r) => r.kind === "heading");
      const contents = next < 0 ? following : following.slice(0, next);
      if (contents.length && contents.every((r) => remove.has(r.id))) {
        headings.push({ id: row.id, title: row.titleOverride ?? "Section" });
        remove.add(row.id);
      }
    });
    return {
      collectionId: source.id,
      title: source.title,
      referenceCount: references.filter((r) => r.collectionId === source.id).length,
      removedSections: headings,
    };
  });
  const token = createHash("sha256")
    .update(
      JSON.stringify({
        action,
        id: collection.id,
        hubId: collection.hubId,
        version: String(collection.version),
        title: collection.title,
        affected: affected.map((source) => ({
          id: source.id,
          title: source.title,
          version: String(source.version),
          rows: source.resources.map((r) => [
            r.id,
            String(r.version),
            r.position,
            r.kind,
            r.linkedCollectionId,
            r.titleOverride,
            r.sectionDescription,
          ]),
        })),
      }),
    )
    .digest("hex");
  const view: CollectionImpact = {
    action,
    token,
    referenceCount: references.length,
    collections: groups,
  };
  return { view, removeIds: [...remove], affected };
}

export async function applyCollectionImpact(
  tx: Prisma.TransactionClient,
  collection: Collection,
  actorUserId: string,
  action: "delete" | "transfer",
  token?: string,
) {
  const impact = await collectionImpact(tx, collection, action);
  if ((token && token !== impact.view.token) || (!token && impact.view.referenceCount))
    throw appError("version_conflict");
  for (const source of impact.affected) {
    const rows = source.resources.filter((r) => impact.removeIds.includes(r.id));
    await tx.resource.deleteMany({
      where: { collectionId: source.id, id: { in: rows.map((r) => r.id) } },
    });
    for (const row of rows)
      await recordAudit(tx, {
        hubId: source.hubId,
        collectionId: source.id,
        actorUserId,
        resourceId: row.id,
        action: "item.removed",
      });
    await tx.collection.update({
      where: { id: source.id, hubId: collection.hubId },
      data: { version: { increment: 1 } },
    });
  }
}
