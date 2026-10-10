-- AlterTable
ALTER TABLE "users" ADD COLUMN     "deletion_scheduled_for" TIMESTAMPTZ(6);

-- Extend the existing SQL-only invariant; preserve every other constraint.
ALTER TABLE "users" DROP CONSTRAINT "users_account_state_check";
ALTER TABLE "users" ADD CONSTRAINT "users_account_state_check"
  CHECK (account_state IN ('active', 'inactive', 'suspended'));
ALTER TABLE "users" ADD CONSTRAINT "users_deletion_requires_inactive"
  CHECK (deletion_scheduled_for IS NULL OR account_state = 'inactive');
CREATE INDEX "users_deletion_scheduled_for_idx" ON "users" ("deletion_scheduled_for");
