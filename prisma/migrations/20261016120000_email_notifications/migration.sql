-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "notifyCursorAt" TIMESTAMP(3),
ADD COLUMN     "notifyEmail" TEXT[] DEFAULT ARRAY[]::TEXT[];

