-- Collection IDs are the only address identity. Existing rows and relationships
-- remain intact; the retired slug values are intentionally discarded (ADR-0053).
-- This uniqueness rule is a SQL constraint from 0_init, not a standalone index.
BEGIN;
ALTER TABLE "collections"
  DROP CONSTRAINT "collections_hub_slug_unique",
  DROP COLUMN "slug";
COMMIT;
