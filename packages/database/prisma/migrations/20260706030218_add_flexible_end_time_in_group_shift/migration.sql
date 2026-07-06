-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShiftKind" ADD VALUE 'office_control';
ALTER TYPE "ShiftKind" ADD VALUE 'event_temporary';

-- DropForeignKey
ALTER TABLE "group_shifts" DROP CONSTRAINT "group_shifts_end_site_id_fkey";

-- AlterTable
ALTER TABLE "group_shifts" ADD COLUMN     "flexible_end_time" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "end_site_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "group_shifts" ADD CONSTRAINT "group_shifts_end_site_id_fkey" FOREIGN KEY ("end_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
