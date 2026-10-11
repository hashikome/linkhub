import { expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withTestDatabase } from "./test-database";

it("removes only collection slug identity while retaining data and SQL-only invariants", async () => {
  await withTestDatabase(async ({ sql }) => {
    const root = resolve(import.meta.dir, "../apps/api/prisma/migrations");
    const target = "20261011113038_remove_collection_slugs";
    for (const name of (await readdir(root)).filter((name) => name < target).sort()) {
      await sql.unsafe(await readFile(resolve(root, name, "migration.sql"), "utf8"));
    }
    const [user] = await sql`INSERT INTO users (username, name, email)
      VALUES ('id-migration', 'Migration', 'id-migration@example.com') RETURNING id`;
    const [hub] = await sql`INSERT INTO hubs (owner_user_id, handle)
      VALUES (${user.id}, 'id-migration') RETURNING id`;
    const [source] = await sql`INSERT INTO collections (hub_id, slug, title, creator_user_id)
      VALUES (${hub.id}, 'source', 'Same title', ${user.id}) RETURNING id`;
    const [targetCollection] = await sql`INSERT INTO collections (hub_id, slug, title)
      VALUES (${hub.id}, 'target', 'Same title') RETURNING id`;
    const [item] =
      await sql`INSERT INTO resources (collection_id, kind, linked_collection_id, position)
      VALUES (${source.id}, 'collection_link', ${targetCollection.id}, 0) RETURNING id`;
    const triggers = () => sql`SELECT tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger
      WHERE NOT tgisinternal ORDER BY tgname, definition`;
    const constraints =
      () => sql`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conname NOT IN ('collections_hub_slug_unique', 'collections_slug_not_null')
      ORDER BY conname, definition`;
    const beforeTriggers = await triggers(),
      beforeConstraints = await constraints();
    await sql.unsafe(await readFile(resolve(root, target, "migration.sql"), "utf8"));
    expect(
      await sql`SELECT id, hub_id, title, creator_user_id FROM collections WHERE id = ${source.id}`,
    ).toEqual([{ id: source.id, hub_id: hub.id, title: "Same title", creator_user_id: user.id }]);
    expect(
      await sql`SELECT id, collection_id, linked_collection_id, position FROM resources WHERE id = ${item.id}`,
    ).toEqual([
      {
        id: item.id,
        collection_id: source.id,
        linked_collection_id: targetCollection.id,
        position: 0,
      },
    ]);
    expect(
      await sql`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'collections' AND column_name = 'slug'`,
    ).toHaveLength(0);
    expect(await triggers()).toEqual(beforeTriggers);
    expect(await constraints()).toEqual(beforeConstraints);
    const [duplicate] =
      await sql`INSERT INTO collections (hub_id, title) VALUES (${hub.id}, 'Same title') RETURNING id`;
    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.id.split("-")[2][0]).toBe("7");
    expect(
      await sql`SELECT id FROM collections WHERE hub_id = ${hub.id} AND title = 'Same title'`,
    ).toHaveLength(3);
  });
}, 30000);
