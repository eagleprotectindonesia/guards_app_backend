-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertReason" ADD VALUE 'geofence_breach';
ALTER TYPE "AlertReason" ADD VALUE 'location_services_disabled';

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "geofence_radius" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
ADD COLUMN     "geofence_status" BOOLEAN DEFAULT true;
