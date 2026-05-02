-- Add date_of_joining to employees with backfill from createdAt
ALTER TABLE "employees"
ADD COLUMN "date_of_joining" TIMESTAMP(3);

UPDATE "employees"
SET "date_of_joining" = "createdAt"
WHERE "date_of_joining" IS NULL;

ALTER TABLE "employees"
ALTER COLUMN "date_of_joining" SET NOT NULL;
