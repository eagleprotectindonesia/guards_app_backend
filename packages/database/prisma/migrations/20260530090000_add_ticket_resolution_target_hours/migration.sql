ALTER TABLE "tickets"
ADD COLUMN IF NOT EXISTS "resolution_target_hours" INTEGER;

UPDATE "tickets"
SET "resolution_target_hours" = 4
WHERE "resolution_target_hours" IS NULL;

ALTER TABLE "tickets"
ALTER COLUMN "resolution_target_hours" SET NOT NULL;
