// Seeds the toolkit curator's hub with real, curated collections (see
// prisma/seed/toolkit.ts). Rerunnable: the curator's collections are replaced.
//
//   bun run db:seed                       # curator account seed-curator@nslinkhub.dev
//   SEED_OWNER_EMAIL=you@… bun run db:seed  # seed into the account you sign in with
//   SEED_OFFLINE=1 bun run db:seed        # skip page lookups (the worker fetches later)
import { publicLinkUrl } from "../src/common/utils/url.util";
import { PrismaService } from "../src/database/prisma.service";
import { itemTags } from "../src/modules/resources/item-tags";
import { fetchPageMetadata, type PageMetadata } from "../src/modules/resources/page-metadata";
import { type SeedItem, seedCollections, seedHub } from "./seed/toolkit";

const email = (process.env.SEED_OWNER_EMAIL ?? "seed-curator@nslinkhub.dev").toLowerCase();
const offline = process.env.SEED_OFFLINE === "1";
const prisma = new PrismaService();

// Metadata comes from the pages, as for any saved link. A few lookups run at a
// time; unreadable pages are left to the worker.
async function resolveMetadata(urls: string[]) {
  const found = new Map<string, PageMetadata | null>();
  const queue = [...new Set(urls)];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let url = queue.shift(); url; url = queue.shift())
        found.set(url, offline ? null : await fetchPageMetadata(url));
    }),
  );
  return found;
}

async function main() {
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: { email, username: seedHub.handle, name: seedHub.userName, emailVerified: true },
    }));
  const hub =
    (await prisma.hub.findUnique({ where: { ownerUserId: user.id } })) ??
    (await prisma.hub.create({
      data: { ownerUserId: user.id, handle: seedHub.handle, name: seedHub.hubName },
    }));
  await prisma.hub.update({
    where: { id: hub.id },
    data: { name: seedHub.hubName, description: seedHub.description },
  });
  await prisma.collection.deleteMany({ where: { hubId: hub.id } });
  await prisma.auditLog.deleteMany({ where: { hubId: hub.id } });

  const links = seedCollections.flatMap((c) =>
    c.items.filter((item): item is Extract<SeedItem, ["l", ...unknown[]]> => item[0] === "l"),
  );
  const metadata = await resolveMetadata(links.map((item) => publicLinkUrl(item[1])));

  const ids = new Map<string, string>();
  for (const c of seedCollections) {
    const created = await prisma.collection.create({
      data: {
        hubId: hub.id,
        title: c.title,
        description: c.description,
        published: c.published,
        creatorUserId: user.id,
      },
    });
    ids.set(c.key, created.id);
    // Attribution comes from activity entries, as for anything saved in the app.
    await prisma.auditLog.create({
      data: {
        hubId: hub.id,
        actorUserId: user.id,
        collectionId: created.id,
        action: "collection.created",
      },
    });
  }
  let resolved = 0;
  for (const c of seedCollections) {
    const collectionId = ids.get(c.key) as string;
    for (const [position, item] of c.items.entries()) {
      if (item[0] === "h") {
        await prisma.resource.create({
          data: {
            collectionId,
            position,
            kind: "heading",
            titleOverride: item[1],
            addedByUserId: user.id,
          },
        });
      } else if (item[0] === "c") {
        const target = ids.get(item[1]);
        if (!target) throw new Error(`Unknown collection reference: ${item[1]}`);
        await prisma.resource.create({
          data: {
            collectionId,
            position,
            kind: "collection_link",
            linkedCollectionId: target,
            tags: await itemTags(prisma, item[2]),
            addedByUserId: user.id,
          },
        });
      } else {
        const url = publicLinkUrl(item[1]);
        const page = metadata.get(url);
        if (page?.title) resolved++;
        await prisma.resource.create({
          data: {
            collectionId,
            position,
            kind: "external_link",
            url,
            tags: await itemTags(prisma, item[3]),
            addedByUserId: user.id,
          },
        });
        // Only text read from the page enters the shared metadata; a page that
        // couldn't be read stays pending for the worker (the curated text is
        // never stored, since every saver of that address would see it).
        const ready = page && {
          title: page.title,
          description: page.description,
          siteName: page.siteName,
          state: "ready",
          fetchedAt: new Date(),
        };
        await prisma.linkMetadata.upsert({
          where: { url },
          create: { url, ...(ready ?? {}) },
          update: ready ?? {},
        });
      }
    }
  }
  console.log(
    `Seeded @${hub.handle} (${email}): ${seedCollections.length} collections, ${links.length} links, ${resolved} titles read from their pages.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
