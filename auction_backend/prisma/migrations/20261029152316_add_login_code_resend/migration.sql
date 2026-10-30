-- DropIndex
DROP INDEX "EmailLoginChallenge_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "EmailLoginChallenge" ADD COLUMN     "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "resendCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "EmailLoginChallenge_userId_lastSentAt_idx" ON "EmailLoginChallenge"("userId", "lastSentAt");
