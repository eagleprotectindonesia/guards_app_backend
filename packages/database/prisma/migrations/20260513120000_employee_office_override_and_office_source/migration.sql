ALTER TABLE "employees" ADD COLUMN "office_sync_override" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OfficeSource') THEN
    CREATE TYPE "OfficeSource" AS ENUM ('external', 'manual');
  END IF;
END$$;

ALTER TABLE "offices" ADD COLUMN "source" "OfficeSource" NOT NULL DEFAULT 'manual';
