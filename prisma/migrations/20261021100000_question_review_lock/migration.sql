-- CreateTable
CREATE TABLE "QuestionReviewLock" (
    "questionId" TEXT NOT NULL,
    "lockedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionReviewLock_pkey" PRIMARY KEY ("questionId")
);

-- AddForeignKey
ALTER TABLE "QuestionReviewLock" ADD CONSTRAINT "QuestionReviewLock_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionReviewLock" ADD CONSTRAINT "QuestionReviewLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
