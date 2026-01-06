-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "guards" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shift_types" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "admins_deleted_at_idx" ON "admins"("deleted_at");

-- CreateIndex
CREATE INDEX "guards_deleted_at_idx" ON "guards"("deleted_at");

-- CreateIndex
CREATE INDEX "shift_types_deleted_at_idx" ON "shift_types"("deleted_at");

-- CreateIndex
CREATE INDEX "shifts_deleted_at_idx" ON "shifts"("deleted_at");

-- CreateIndex
CREATE INDEX "sites_status_idx" ON "sites"("status");

-- CreateIndex
CREATE INDEX "sites_deleted_at_idx" ON "sites"("deleted_at");
