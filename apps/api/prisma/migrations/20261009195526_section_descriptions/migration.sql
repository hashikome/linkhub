-- AlterTable
ALTER TABLE "resources" ADD COLUMN     "section_description" VARCHAR(500);

-- Authored context belongs only to section headings; link descriptions are fetched.
ALTER TABLE "resources" ADD CONSTRAINT "resources_section_description_check"
CHECK (section_description IS NULL OR
  (kind = 'heading' AND length(btrim(section_description)) > 0));
