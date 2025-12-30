-- AlterTable
ALTER TABLE "shift_types" ADD COLUMN     "last_updated_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "shift_types" ADD CONSTRAINT "shift_types_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
