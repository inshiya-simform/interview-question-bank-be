-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Question_status_submittedAt_idx" ON "Question"("status", "submittedAt");


-- Existing questions were submitted when they were created.
UPDATE "Question" SET "submittedAt" = "createdAt";
