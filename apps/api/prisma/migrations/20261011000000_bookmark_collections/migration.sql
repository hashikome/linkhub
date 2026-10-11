/*
  Warnings:

  - You are about to drop the column `source_folder_id` on the `import_rows` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "import_rows" DROP CONSTRAINT "import_rows_draft_id_source_folder_id_fkey";

-- AlterTable
ALTER TABLE "import_folders" ADD COLUMN     "reference_id" UUID;

-- AlterTable
ALTER TABLE "import_rows" DROP COLUMN "source_folder_id";

-- Keep saved resources/row receipts intact while replacing legacy draft-only
-- arrangements. Skipped source trees stay dropped; manual row edits stay placed.
WITH RECURSIVE skipped AS (
  SELECT id, draft_id FROM import_folders WHERE mode = 'skip'
  UNION ALL
  SELECT f.id, f.draft_id FROM import_folders f JOIN skipped s
    ON f.parent_id = s.id AND f.draft_id = s.draft_id
)
UPDATE import_rows r SET dropped = true FROM skipped s
WHERE r.folder_id = s.id AND r.draft_id = s.draft_id AND r.resource_id IS NULL;

-- Old drafts did not retain browser attributes. Only recognized names directly
-- under the synthetic root qualify; identically named nested user folders stay.
CREATE TEMP TABLE bookmark_wrappers AS
SELECT f.id, f.draft_id, f.parent_id FROM import_folders f
JOIN import_folders root ON root.id = f.parent_id AND root.parent_id IS NULL
JOIN import_drafts d ON d.id = f.draft_id
WHERE d.source_kind = 'bookmarks' AND NOT f.manual
  AND lower(f.name) IN ('bookmarks bar','bookmarks toolbar','bookmarks menu',
                       'other bookmarks','mobile bookmarks','unfiled bookmarks');
UPDATE import_rows r SET folder_id = w.parent_id FROM bookmark_wrappers w
WHERE r.folder_id = w.id AND r.draft_id = w.draft_id;
UPDATE import_folders f SET parent_id = w.parent_id FROM bookmark_wrappers w
WHERE f.parent_id = w.id AND f.draft_id = w.draft_id;
DELETE FROM import_folders f USING bookmark_wrappers w WHERE f.id = w.id;
DROP TABLE bookmark_wrappers;

UPDATE import_folders f SET mode = CASE
  WHEN f.parent_id IS NULL OR parent.parent_id IS NULL OR EXISTS (
    SELECT 1 FROM import_folders child WHERE child.parent_id = f.id AND NOT child.manual
  ) THEN 'collection' ELSE 'section' END,
  new_title = CASE WHEN f.parent_id IS NULL THEN '' ELSE f.name END,
  target_collection_id = NULL, heading_id = NULL, published = false
FROM import_drafts d, import_folders parent
WHERE d.id = f.draft_id AND d.source_kind = 'bookmarks' AND NOT f.manual
  AND parent.id = coalesce(f.parent_id, f.id);
UPDATE import_folders f SET name = '', new_title = ''
FROM import_drafts d WHERE d.id = f.draft_id AND f.parent_id IS NULL
  AND d.source_kind IN ('bookmarks','text') AND f.new_title IN ('', 'Imported links')
  AND f.target_collection_id IS NULL;
WITH RECURSIVE paths AS (
  SELECT id, ''::text AS path FROM import_folders WHERE parent_id IS NULL
  UNION ALL
  SELECT f.id, CASE WHEN p.path = '' THEN f.name ELSE p.path || ' › ' || f.name END
  FROM import_folders f JOIN paths p ON f.parent_id = p.id
)
UPDATE import_folders f SET path = p.path FROM paths p WHERE f.id = p.id;
UPDATE import_drafts SET version = version + 1 WHERE source_kind = 'bookmarks';

-- The new importer creates private collections only; skip is a row decision.
ALTER TABLE "import_folders" DROP COLUMN "published";
UPDATE import_folders SET mode = 'section' WHERE mode = 'skip';
ALTER TABLE import_folders DROP CONSTRAINT import_folders_mode_check;
ALTER TABLE import_folders ADD CONSTRAINT import_folders_mode_check CHECK (mode IN ('collection','section'));
