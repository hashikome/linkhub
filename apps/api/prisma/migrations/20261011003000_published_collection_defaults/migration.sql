-- AlterTable
ALTER TABLE "collections" ALTER COLUMN "published" SET DEFAULT true;

-- AlterTable
ALTER TABLE "import_folders" ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT true;
