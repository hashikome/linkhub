-- AlterTable
ALTER TABLE "operator_audit" ADD COLUMN     "hub_id" UUID;

-- CreateIndex
CREATE INDEX "operator_audit_hub_id_created_at_id_idx" ON "operator_audit"("hub_id", "created_at" DESC, "id" DESC);
