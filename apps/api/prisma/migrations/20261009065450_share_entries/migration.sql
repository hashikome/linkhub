-- CreateTable
CREATE TABLE "share_entries" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "created_by_user_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "resource_id" UUID,
    "message" VARCHAR(1000) NOT NULL,
    "destination" VARCHAR(100),
    "operation_id" UUID,
    "payload_hash" VARCHAR(64),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_opens" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "share_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_opens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_entries_created_by_user_id_id_idx" ON "share_entries"("created_by_user_id", "id" DESC);

-- CreateIndex
CREATE INDEX "share_entries_kind_resource_id_created_at_idx" ON "share_entries"("kind", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "share_entries_created_at_idx" ON "share_entries"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "share_entries_created_by_user_id_operation_id_key" ON "share_entries"("created_by_user_id", "operation_id");

-- CreateIndex
CREATE INDEX "share_opens_share_id_created_at_idx" ON "share_opens"("share_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "share_opens_share_id_event_id_key" ON "share_opens"("share_id", "event_id");

-- AddForeignKey
ALTER TABLE "share_entries" ADD CONSTRAINT "share_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "share_opens" ADD CONSTRAINT "share_opens_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "share_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- SQL-only invariants: a site has no resource ID; all other kinds do.
ALTER TABLE "share_entries" ADD CONSTRAINT "share_entries_target_check" CHECK (
  (kind = 'site' AND resource_id IS NULL) OR
  (kind IN ('profile', 'hub', 'collection') AND resource_id IS NOT NULL)
);
ALTER TABLE "share_entries" ADD CONSTRAINT "share_entries_open_count_check" CHECK (open_count >= 0);
ALTER TABLE "share_entries" ADD CONSTRAINT "share_entries_message_check" CHECK (length(btrim(message)) > 0);
ALTER TABLE "share_entries" ADD CONSTRAINT "share_entries_operation_check" CHECK (
  (operation_id IS NULL AND payload_hash IS NULL) OR
  (operation_id IS NOT NULL AND payload_hash IS NOT NULL)
);
