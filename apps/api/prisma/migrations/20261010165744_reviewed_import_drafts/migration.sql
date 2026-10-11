-- CreateTable
CREATE TABLE "import_drafts" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "user_id" UUID NOT NULL,
    "hub_id" UUID NOT NULL,
    "source_kind" VARCHAR(24) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_folders" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "draft_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "path" VARCHAR(2000) NOT NULL,
    "position" INTEGER NOT NULL,
    "mode" VARCHAR(16) NOT NULL DEFAULT 'section',
    "target_collection_id" UUID,
    "new_title" VARCHAR(255) NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "heading_id" UUID,

    CONSTRAINT "import_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL DEFAULT app_uuid_v7(),
    "draft_id" UUID NOT NULL,
    "folder_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "source_location" VARCHAR(100) NOT NULL,
    "address" VARCHAR(8192) NOT NULL,
    "url" VARCHAR(2048),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "failure" VARCHAR(32),
    "resource_id" UUID,
    "dropped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_drafts_user_id_closed_expires_at_idx" ON "import_drafts"("user_id", "closed", "expires_at");

-- CreateIndex
CREATE INDEX "import_drafts_expires_at_idx" ON "import_drafts"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_folders_draft_id_id_key" ON "import_folders"("draft_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_folders_draft_id_position_key" ON "import_folders"("draft_id", "position");

-- CreateIndex
CREATE INDEX "import_rows_url_idx" ON "import_rows"("url");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_draft_id_position_key" ON "import_rows"("draft_id", "position");

-- AddForeignKey
ALTER TABLE "import_drafts" ADD CONSTRAINT "import_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "import_drafts" ADD CONSTRAINT "import_drafts_hub_id_fkey" FOREIGN KEY ("hub_id") REFERENCES "hubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "import_folders" ADD CONSTRAINT "import_folders_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "import_drafts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "import_folders" ADD CONSTRAINT "import_folders_draft_id_parent_id_fkey" FOREIGN KEY ("draft_id", "parent_id") REFERENCES "import_folders"("draft_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "import_drafts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_draft_id_folder_id_fkey" FOREIGN KEY ("draft_id", "folder_id") REFERENCES "import_folders"("draft_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- SQL-only invariants remain alongside the Prisma-generated additive tables.
ALTER TABLE import_drafts ADD CONSTRAINT import_drafts_source_check CHECK (source_kind IN ('csv','bookmarks','paste'));
ALTER TABLE import_drafts ADD CONSTRAINT import_drafts_version_check CHECK (version > 0);
ALTER TABLE import_folders ADD CONSTRAINT import_folders_mode_check CHECK (mode IN ('collection','section','skip'));
ALTER TABLE import_folders ADD CONSTRAINT import_folders_root_check CHECK (parent_id IS NOT NULL OR mode = 'collection');
ALTER TABLE import_folders ADD CONSTRAINT import_folders_parent_check CHECK (parent_id IS DISTINCT FROM id);
ALTER TABLE import_folders ADD CONSTRAINT import_folders_position_check CHECK (position >= 0);
ALTER TABLE import_rows ADD CONSTRAINT import_rows_position_check CHECK (position >= 0);
ALTER TABLE import_rows ADD CONSTRAINT import_rows_tags_check CHECK (cardinality(tags) <= 30);
CREATE TRIGGER set_updated_at BEFORE UPDATE ON import_drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
