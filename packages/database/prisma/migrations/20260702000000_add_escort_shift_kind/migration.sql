-- Create SiteKind enum
CREATE TYPE "SiteKind" AS ENUM ('fixed', 'escort');

-- Create ShiftKind enum
CREATE TYPE "ShiftKind" AS ENUM ('onsite', 'escort');

-- Add kind to sites (default 'fixed' for existing sites)
ALTER TABLE "sites"
ADD COLUMN "kind" "SiteKind" NOT NULL DEFAULT 'fixed';

-- Add kind and escort_end_site_id to shifts
ALTER TABLE "shifts"
ADD COLUMN "kind" "ShiftKind" NOT NULL DEFAULT 'onsite',
ADD COLUMN "escort_end_site_id" TEXT;

-- Add FK constraint for escort_end_site_id
ALTER TABLE "shifts"
ADD CONSTRAINT "shifts_escort_end_site_id_fkey"
FOREIGN KEY ("escort_end_site_id") REFERENCES "sites"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX "sites_status_kind_deleted_at_idx" ON "sites"("status", "kind", "deleted_at");
CREATE INDEX "shifts_site_id_kind_status_starts_at_idx" ON "shifts"("site_id", "kind", "status", "starts_at");
CREATE INDEX "shifts_escort_end_site_id_idx" ON "shifts"("escort_end_site_id");
