-- DropIndex
DROP INDEX "Comment_questionId_score_idx";

-- DropIndex
DROP INDEX "Comment_parentId_idx";

-- CreateIndex
CREATE INDEX "Comment_questionId_parentId_score_createdAt_idx" ON "Comment"("questionId", "parentId", "score" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Comment_parentId_createdAt_idx" ON "Comment"("parentId", "createdAt");
