UPDATE "Lot" AS lot
SET "isActive" = false
WHERE lot."isActive" = true
  AND EXISTS (
    SELECT 1
    FROM "Wins" AS win
    WHERE win."lotId" = lot."id"
  );
