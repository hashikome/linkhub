import { expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withTestDatabase } from "./test-database";

it("migrates item arrays into shared identities and stored collection tags without losing order", async () => {
  await withTestDatabase(async ({ sql }) => {
    const root = resolve(import.meta.dir, "../apps/api/prisma/migrations");
    const target = "20261009233150_collection_tags_relation";
    for (const name of (await readdir(root)).filter((name) => name < target).sort()) {
      await sql.unsafe(await readFile(resolve(root, name, "migration.sql"), "utf8"));
    }
    const [user] = await sql`INSERT INTO users (username, name, email)
      VALUES ('migration-tags', 'Migration tags', 'tag-migration@example.com') RETURNING id`;
    const [hub] = await sql`INSERT INTO hubs (owner_user_id, handle)
      VALUES (${user.id}, 'migration-tags') RETURNING id`;
    const [collection] = await sql`INSERT INTO collections (hub_id, slug, title, tags)
      VALUES (${hub.id}, 'migration', 'Migration', ARRAY['retired-label']) RETURNING id`;
    const [first] = await sql`INSERT INTO resources (collection_id, kind, url, position, tags)
      VALUES (${collection.id}, 'external_link', 'https://fixture-links.dev/migration-1', 0,
      ARRAY['SQL', 'reference', 'sql', '  data   stores  ']) RETURNING id`;
    await sql`INSERT INTO resources (collection_id, kind, url, position, tags)
      VALUES (${collection.id}, 'external_link', 'https://fixture-links.dev/migration-2', 1,
      ARRAY['sql'])`;
    await sql.unsafe(await readFile(resolve(root, target, "migration.sql"), "utf8"));
    const names = await sql`SELECT t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id
      WHERE it.item_id = ${first.id} ORDER BY it.position`;
    expect(names.map((row) => row.name)).toEqual(["sql", "reference", "data stores"]);
    const stored = await sql`SELECT t.name, ct.item_count FROM collection_tags ct
      JOIN tags t ON t.id = ct.tag_id WHERE ct.collection_id = ${collection.id} ORDER BY t.name`;
    expect(stored.map((row) => [row.name, row.item_count])).toEqual([
      ["data stores", 1],
      ["reference", 1],
      ["sql", 2],
    ]);
    expect(await sql`SELECT name FROM tags WHERE name = 'retired-label'`).toHaveLength(0);
    expect(await sql`SELECT id FROM resources WHERE collection_id = ${collection.id}`).toHaveLength(
      2,
    );
    await sql`DELETE FROM resources WHERE id = ${first.id}`;
    expect(
      (
        await sql`SELECT item_count FROM collection_tags WHERE collection_id = ${collection.id}`
      ).map((row) => row.item_count),
    ).toEqual([1]);
  });
}, 30000);
