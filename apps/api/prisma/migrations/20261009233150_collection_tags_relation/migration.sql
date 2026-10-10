BEGIN;

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_tags" (
    "item_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "item_tags_pkey" PRIMARY KEY ("item_id","tag_id")
);

-- CreateTable
CREATE TABLE "collection_tags" (
    "collection_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "item_count" INTEGER NOT NULL,

    CONSTRAINT "collection_tags_pkey" PRIMARY KEY ("collection_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_unique" ON "tags"("name");

-- CreateIndex
CREATE INDEX "idx_item_tags_tag_id" ON "item_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_collection_tags_tag_id" ON "collection_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "resources"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collection_tags" ADD CONSTRAINT "collection_tags_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collection_tags" ADD CONSTRAINT "collection_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE tags ADD CONSTRAINT tags_name_normalized_check
CHECK (name <> '' AND name = lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))));
ALTER TABLE item_tags ADD CONSTRAINT item_tags_position_check CHECK (position >= 0);
ALTER TABLE collection_tags ADD CONSTRAINT collection_tags_item_count_check CHECK (item_count >= 0);

-- Backfill before dropping arrays; preserve item tag order and deduplicate names.
CREATE TEMP TABLE migrated_item_tags ON COMMIT DROP AS
SELECT r.id AS item_id,
  left(lower(btrim(regexp_replace(t.name, '\s+', ' ', 'g'))), 80) AS name,
  min(t.position)::int - 1 AS position
FROM resources r CROSS JOIN LATERAL unnest(r.tags) WITH ORDINALITY AS t(name, position)
GROUP BY r.id, left(lower(btrim(regexp_replace(t.name, '\s+', ' ', 'g'))), 80);
INSERT INTO tags (name) SELECT DISTINCT name FROM migrated_item_tags WHERE name <> '';
INSERT INTO item_tags (item_id, tag_id, position)
SELECT m.item_id, t.id, m.position FROM migrated_item_tags m JOIN tags t ON t.name = m.name;
INSERT INTO collection_tags (collection_id, tag_id, item_count)
SELECT r.collection_id, it.tag_id, count(*)::int
FROM item_tags it JOIN resources r ON r.id = it.item_id
GROUP BY r.collection_id, it.tag_id;

-- The old independently authored collection labels are intentionally retired.
ALTER TABLE collections DROP COLUMN tags;
ALTER TABLE resources DROP COLUMN tags;

-- Increment/decrement stored membership atomically. Do not recompute from a
-- potentially stale snapshot while other items acquire/release the same tag.
CREATE FUNCTION adjust_collection_tag(collection uuid, tag uuid, delta integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF delta > 0 THEN
    INSERT INTO collection_tags (collection_id, tag_id, item_count)
    VALUES (collection, tag, delta)
    ON CONFLICT (collection_id, tag_id) DO UPDATE
    SET item_count = collection_tags.item_count + EXCLUDED.item_count;
  ELSE
    UPDATE collection_tags SET item_count = item_count + delta
    WHERE collection_id = collection AND tag_id = tag;
    DELETE FROM collection_tags
    WHERE collection_id = collection AND tag_id = tag AND item_count = 0;
  END IF;
END;
$$;

CREATE FUNCTION sync_item_collection_tag() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owning_collection uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT collection_id INTO owning_collection FROM resources WHERE id = NEW.item_id;
    PERFORM adjust_collection_tag(owning_collection, NEW.tag_id, 1);
  ELSE
    SELECT collection_id INTO owning_collection FROM resources WHERE id = OLD.item_id;
    -- Resource deletion handles its counts before the parent row disappears.
    IF owning_collection IS NOT NULL THEN
      PERFORM adjust_collection_tag(owning_collection, OLD.tag_id, -1);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER item_tags_sync_collection
AFTER INSERT OR DELETE ON item_tags
FOR EACH ROW EXECUTE FUNCTION sync_item_collection_tag();

-- Association keys are immutable: change assignments by deleting/inserting rows.
CREATE FUNCTION immutable_item_tag_keys() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.item_id, OLD.tag_id) IS DISTINCT FROM (NEW.item_id, NEW.tag_id) THEN
    RAISE EXCEPTION 'item tag association keys are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER item_tags_immutable_keys BEFORE UPDATE OF item_id, tag_id ON item_tags
FOR EACH ROW EXECUTE FUNCTION immutable_item_tag_keys();

CREATE FUNCTION sync_resource_collection_tags() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assigned_tag uuid;
BEGIN
  IF TG_OP = 'DELETE' OR OLD.collection_id <> NEW.collection_id THEN
    FOR assigned_tag IN SELECT tag_id FROM item_tags WHERE item_id = OLD.id ORDER BY tag_id LOOP
      PERFORM adjust_collection_tag(OLD.collection_id, assigned_tag, -1);
      IF TG_OP = 'UPDATE' THEN
        PERFORM adjust_collection_tag(NEW.collection_id, assigned_tag, 1);
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER resources_sync_collection_tags
BEFORE DELETE OR UPDATE OF collection_id ON resources
FOR EACH ROW EXECUTE FUNCTION sync_resource_collection_tags();

COMMIT;
