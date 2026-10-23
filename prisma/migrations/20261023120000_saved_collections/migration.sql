-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedQuestion" (
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedQuestion_pkey" PRIMARY KEY ("userId","questionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_userId_normalizedName_key" ON "Collection"("userId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_id_userId_key" ON "Collection"("id", "userId");

-- CreateIndex
CREATE INDEX "SavedQuestion_collectionId_savedAt_idx" ON "SavedQuestion"("collectionId", "savedAt" DESC);

-- CreateIndex
CREATE INDEX "SavedQuestion_questionId_idx" ON "SavedQuestion"("questionId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuestion" ADD CONSTRAINT "SavedQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuestion" ADD CONSTRAINT "SavedQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedQuestion" ADD CONSTRAINT "SavedQuestion_collectionId_userId_fkey" FOREIGN KEY ("collectionId", "userId") REFERENCES "Collection"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
