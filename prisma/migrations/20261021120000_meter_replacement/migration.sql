-- AlterTable
ALTER TABLE "Meter" ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "replacedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Meter_replacedById_key" ON "Meter"("replacedById");

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "Meter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
