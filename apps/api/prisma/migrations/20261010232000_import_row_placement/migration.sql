-- AlterTable
ALTER TABLE "import_folders" ADD COLUMN     "manual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "import_rows" ADD COLUMN     "source_folder_id" UUID;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_draft_id_source_folder_id_fkey" FOREIGN KEY ("draft_id", "source_folder_id") REFERENCES "import_folders"("draft_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
