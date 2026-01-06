-- AlterTable
ALTER TABLE "admins" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "note" TEXT;

-- CreateIndex
CREATE INDEX "guards_guard_code_idx" ON "guards"("guard_code");
