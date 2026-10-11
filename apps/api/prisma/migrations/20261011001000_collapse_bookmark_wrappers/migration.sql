-- Data-only refinement. Never restructure collections already created, manual
-- destinations or source folders containing links (even failed/dropped links).
CREATE TEMP TABLE changed_bookmark_drafts (id uuid PRIMARY KEY);
DO $$
DECLARE candidate record;
BEGIN
  LOOP
    SELECT f.id, f.draft_id INTO candidate FROM import_folders f
    JOIN import_drafts d ON d.id = f.draft_id
    WHERE d.source_kind = 'bookmarks' AND f.parent_id IS NOT NULL
      AND NOT f.manual AND f.target_collection_id IS NULL AND f.reference_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM import_rows r WHERE r.folder_id = f.id)
      AND NOT EXISTS (SELECT 1 FROM import_folders child WHERE child.parent_id = f.id)
    LIMIT 1;
    EXIT WHEN NOT FOUND;
    INSERT INTO changed_bookmark_drafts VALUES(candidate.draft_id) ON CONFLICT DO NOTHING;
    DELETE FROM import_folders WHERE id = candidate.id;
  END LOOP;
  -- Empty descendants no longer make an otherwise leaf folder a branch.
  WITH changed AS (
    UPDATE import_folders f SET mode = 'section'
    FROM import_folders parent, import_drafts d
    WHERE f.parent_id = parent.id AND parent.parent_id IS NOT NULL
      AND d.id = f.draft_id AND d.source_kind = 'bookmarks'
      AND NOT f.manual AND f.mode = 'collection'
      AND f.target_collection_id IS NULL AND f.reference_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM import_folders child WHERE child.parent_id = f.id)
    RETURNING f.draft_id
  ) INSERT INTO changed_bookmark_drafts SELECT draft_id FROM changed ON CONFLICT DO NOTHING;
  LOOP
    SELECT f.id, f.draft_id, f.parent_id, child.id AS child_id INTO candidate
    FROM import_folders f JOIN import_drafts d ON d.id = f.draft_id
    JOIN import_folders child ON child.parent_id = f.id
    WHERE d.source_kind = 'bookmarks' AND f.parent_id IS NOT NULL
      AND NOT f.manual AND f.mode = 'collection'
      AND f.target_collection_id IS NULL AND f.reference_id IS NULL
      AND NOT child.manual AND child.mode = 'collection'
      AND NOT EXISTS (SELECT 1 FROM import_rows r WHERE r.folder_id = f.id)
      AND NOT EXISTS (SELECT 1 FROM import_folders sibling WHERE sibling.parent_id = f.id AND sibling.id <> child.id)
    ORDER BY f.position DESC LIMIT 1;
    EXIT WHEN NOT FOUND;
    INSERT INTO changed_bookmark_drafts VALUES(candidate.draft_id) ON CONFLICT DO NOTHING;
    UPDATE import_folders SET parent_id = candidate.parent_id WHERE id = candidate.child_id;
    DELETE FROM import_folders WHERE id = candidate.id;
  END LOOP;
END $$;
WITH RECURSIVE paths AS (
  SELECT f.id, ''::text AS path FROM import_folders f
  JOIN changed_bookmark_drafts d ON d.id = f.draft_id WHERE f.parent_id IS NULL
  UNION ALL
  SELECT f.id, CASE WHEN p.path = '' THEN f.name ELSE p.path || ' › ' || f.name END
  FROM import_folders f JOIN paths p ON f.parent_id = p.id
)
UPDATE import_folders f SET path = p.path FROM paths p WHERE f.id = p.id;
UPDATE import_drafts SET version = version + 1 WHERE id IN (SELECT id FROM changed_bookmark_drafts);
DROP TABLE changed_bookmark_drafts;
