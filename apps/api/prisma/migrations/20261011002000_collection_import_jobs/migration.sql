-- AlterTable
ALTER TABLE "import_folders" ADD COLUMN     "job_requested_at" TIMESTAMPTZ(6),
ADD COLUMN     "job_rows" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "job_state" VARCHAR(16) NOT NULL DEFAULT 'review';

ALTER TABLE "import_folders" ADD CONSTRAINT "import_folder_job_state" CHECK (
  "job_state" IN ('review', 'queued', 'running', 'completed', 'failed', 'discarded')
  AND cardinality("job_rows") <= 5000
  AND ("job_state" NOT IN ('queued', 'running') OR
    ("job_requested_at" IS NOT NULL AND cardinality("job_rows") > 0))
);
CREATE INDEX "idx_import_jobs_pending" ON "import_folders" ("job_requested_at", "id")
  WHERE "job_state" IN ('queued', 'running');
