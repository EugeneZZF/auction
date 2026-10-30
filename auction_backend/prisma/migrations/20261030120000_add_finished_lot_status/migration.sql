ALTER TABLE "Lot"
ADD COLUMN "isFinished" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Lot" AS lot
SET "isActive" = false,
    "isFinished" = true
WHERE EXISTS (
  SELECT 1
  FROM "Wins" AS win
  WHERE win."lotId" = lot."id"
);
