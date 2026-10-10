-- AlterTable
ALTER TABLE "audit_records" ADD COLUMN     "after_state" VARCHAR(48),
ADD COLUMN     "before_state" VARCHAR(48),
ADD COLUMN     "outcome" VARCHAR(16);

-- Existing evidence stays unknown; never reconstruct old effects from current state.
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_effect_complete"
CHECK (
  (before_state IS NULL AND after_state IS NULL AND outcome IS NULL)
  OR (before_state IS NOT NULL AND after_state IS NOT NULL
      AND outcome IS NOT NULL AND outcome IN ('success', 'no_change'))
);
