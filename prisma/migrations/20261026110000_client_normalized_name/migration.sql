-- AlterTable
ALTER TABLE "Client" ADD COLUMN "normalizedName" TEXT;
UPDATE "Client" SET "normalizedName" = lower(btrim(regexp_replace("name", '\s+', ' ', 'g')));
ALTER TABLE "Client" ALTER COLUMN "normalizedName" SET NOT NULL;

-- DropIndex
DROP INDEX "Client_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Client_normalizedName_key" ON "Client"("normalizedName");
