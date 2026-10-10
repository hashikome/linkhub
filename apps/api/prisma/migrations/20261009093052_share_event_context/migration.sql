-- AlterTable
ALTER TABLE "share_entries" ADD COLUMN "context" JSONB;
UPDATE "share_entries" SET "context" = jsonb_build_object('destination', "destination")
WHERE "destination" IS NOT NULL;
ALTER TABLE "share_entries" DROP COLUMN "destination";

-- AlterTable
ALTER TABLE "share_opens" ADD COLUMN     "attribution" JSONB,
ADD COLUMN     "context" JSONB,
ADD COLUMN     "occurred_at" TIMESTAMPTZ(6),
ADD COLUMN     "payload_hash" VARCHAR(64);

ALTER TABLE "share_entries" ADD CONSTRAINT share_entries_context_object
  CHECK (context IS NULL OR jsonb_typeof(context) = 'object');
ALTER TABLE "share_opens" ADD CONSTRAINT share_opens_context_object
  CHECK (context IS NULL OR jsonb_typeof(context) = 'object'),
  ADD CONSTRAINT share_opens_attribution_object
  CHECK (attribution IS NULL OR jsonb_typeof(attribution) = 'object');
