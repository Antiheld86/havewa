-- AlterEnum
ALTER TYPE "EmailStatus" ADD VALUE 'GEPLANT';

-- AlterEnum
ALTER TYPE "LetterStatus" ADD VALUE 'GEPLANT';

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Letter" ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "outboxDelayMin" INTEGER DEFAULT 10;

