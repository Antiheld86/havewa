-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "letterAutoRefresh" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "letterAutoRefreshAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LetterStatusEvent" (
    "id" TEXT NOT NULL,
    "letterId" TEXT NOT NULL,
    "status" "LetterStatus" NOT NULL,
    "statusText" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LetterStatusEvent_letterId_idx" ON "LetterStatusEvent"("letterId");

-- AddForeignKey
ALTER TABLE "LetterStatusEvent" ADD CONSTRAINT "LetterStatusEvent_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "Letter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bestehende Briefe: aktuellen Stand als ersten Verlaufseintrag übernehmen
INSERT INTO "LetterStatusEvent" ("id", "letterId", "status", "statusText", "at")
SELECT 'mig_' || "id", "id", "status", "statusText", COALESCE("sentAt", "createdAt") FROM "Letter";
