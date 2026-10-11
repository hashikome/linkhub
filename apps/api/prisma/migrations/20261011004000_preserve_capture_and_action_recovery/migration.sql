-- AlterTable
ALTER TABLE "capture_receipts" ADD COLUMN     "resource_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

-- CreateTable
CREATE TABLE "pending_action_payloads" (
    "token_hash" VARCHAR(64) NOT NULL,
    "payload" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pending_action_payloads_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "pending_action_payloads_expires_at_idx" ON "pending_action_payloads"("expires_at");

ALTER TABLE pending_action_payloads ADD CONSTRAINT pending_action_payload_size
  CHECK (octet_length(payload) BETWEEN 1 AND 65536);
