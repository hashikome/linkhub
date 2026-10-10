import { normalizeTags } from "../../common/utils/tags.util";
import type { Prisma } from "../../generated/prisma/client";

// Call inside the item mutation transaction. Sorted upserts reuse the catalogue
// safely across writers while position preserves the author's input order.
export async function itemTags(db: Pick<Prisma.TransactionClient, "tag">, input?: string[]) {
  const names = normalizeTags(input);
  const ids = new Map<string, string>();
  for (const name of [...names].sort()) {
    const tag = await db.tag.upsert({
      where: { name },
      create: { name },
      update: { name },
      select: { id: true },
    });
    ids.set(name, tag.id);
  }
  return { create: names.map((name, position) => ({ tagId: ids.get(name) as string, position })) };
}
