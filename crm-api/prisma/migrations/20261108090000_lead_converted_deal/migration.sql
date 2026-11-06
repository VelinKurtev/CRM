-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "dealId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_dealId_key" ON "Lead"("dealId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
