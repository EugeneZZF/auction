-- CreateTable
CREATE TABLE "BidHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "bidCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BidHistory_userId_createdAt_idx" ON "BidHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BidHistory_lotId_createdAt_idx" ON "BidHistory"("lotId", "createdAt");

-- AddForeignKey
ALTER TABLE "BidHistory" ADD CONSTRAINT "BidHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidHistory" ADD CONSTRAINT "BidHistory_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
