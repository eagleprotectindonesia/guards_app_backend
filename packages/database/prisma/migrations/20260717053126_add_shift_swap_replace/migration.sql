-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "evidence_s3_key" TEXT,
ADD COLUMN     "replaced_at" TIMESTAMP(3),
ADD COLUMN     "replaced_by_admin_id" TEXT,
ADD COLUMN     "replacement_reason" TEXT,
ADD COLUMN     "swaps_with_shift_id" TEXT;

-- CreateIndex
CREATE INDEX "shifts_replaced_by_admin_id_idx" ON "shifts"("replaced_by_admin_id");

-- CreateIndex
CREATE INDEX "shifts_swaps_with_shift_id_idx" ON "shifts"("swaps_with_shift_id");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_replaced_by_admin_id_fkey" FOREIGN KEY ("replaced_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_swaps_with_shift_id_fkey" FOREIGN KEY ("swaps_with_shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
