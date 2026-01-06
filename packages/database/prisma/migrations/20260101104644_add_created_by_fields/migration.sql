/*
  Warnings:

  - You are about to drop the column `created_by` on the `shifts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "guards" ADD COLUMN     "created_by_id" TEXT;

-- AlterTable
ALTER TABLE "shift_types" ADD COLUMN     "created_by_id" TEXT;

-- AlterTable
ALTER TABLE "shifts" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "last_updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "created_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "guards" ADD CONSTRAINT "guards_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
