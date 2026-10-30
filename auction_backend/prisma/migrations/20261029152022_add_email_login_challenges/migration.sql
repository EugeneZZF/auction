-- CreateTable
CREATE TABLE "EmailLoginChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLoginChallenge_userId_createdAt_idx" ON "EmailLoginChallenge"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailLoginChallenge" ADD CONSTRAINT "EmailLoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
