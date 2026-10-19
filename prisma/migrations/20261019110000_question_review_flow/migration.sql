-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HistoryAction" ADD VALUE 'APPROVED';
ALTER TYPE "HistoryAction" ADD VALUE 'CHANGES_REQUESTED';
ALTER TYPE "HistoryAction" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

-- CreateTable
CREATE TABLE "QuestionDraft" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionDraft_questionId_key" ON "QuestionDraft"("questionId");

-- CreateIndex
CREATE INDEX "Question_status_idx" ON "Question"("status");

-- CreateIndex
CREATE INDEX "Question_publishedAt_idx" ON "Question"("publishedAt");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDraft" ADD CONSTRAINT "QuestionDraft_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing question predates the review cycle, so it is already live.
UPDATE "Question" SET "status" = 'APPROVED', "publishedAt" = "createdAt";

-- question:review replaces question:edit_any for REVIEWER. Reviewers act through
-- approve / reject / request-changes instead of editing directly. Idempotent; see the
-- super_admin_role migration for why permission changes are migrations.
INSERT INTO "Permission" ("code") VALUES ('question:review') ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'question:review'
WHERE r."name" = 'REVIEWER'
ON CONFLICT DO NOTHING;

-- RolePermission rows cascade
DELETE FROM "Permission" WHERE "code" = 'question:edit_any';
