-- Keep existing reviewed drafts while retiring inline pasted-list creation.
BEGIN;
ALTER TABLE import_drafts DROP CONSTRAINT import_drafts_source_check;
UPDATE import_drafts SET source_kind = 'text' WHERE source_kind = 'paste';
ALTER TABLE import_drafts ADD CONSTRAINT import_drafts_source_check
  CHECK (source_kind IN ('csv', 'bookmarks', 'text'));
COMMIT;
