-- CreateEnum
CREATE TYPE "ShiftPhotoReportStatus" AS ENUM ('pending', 'generated', 'failed', 'regenerated');

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "auto_photo_report_status" "ShiftPhotoReportStatus",
ADD COLUMN     "last_auto_photo_report_at" TIMESTAMP(3),
ADD COLUMN     "last_auto_photo_report_id" TEXT;

-- CreateTable
CREATE TABLE "shift_photo_reports" (
    "id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "client_id" TEXT,
    "shift_starts_at" TIMESTAMPTZ(6) NOT NULL,
    "shift_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "ShiftPhotoReportStatus" NOT NULL DEFAULT 'pending',
    "pdf_s3_key" TEXT,
    "pdf_s3_bucket" TEXT,
    "pdf_size_bytes" INTEGER,
    "photo_count" INTEGER NOT NULL DEFAULT 0,
    "generated_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "regenerated_from_id" TEXT,
    "triggered_by" TEXT NOT NULL DEFAULT 'auto',
    "created_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_photo_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_photo_reports_shift_id_created_at_idx" ON "shift_photo_reports"("shift_id", "created_at");

-- CreateIndex
CREATE INDEX "shift_photo_reports_employee_id_created_at_idx" ON "shift_photo_reports"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "shift_photo_reports_status_idx" ON "shift_photo_reports"("status");

-- CreateIndex
CREATE INDEX "shift_photo_reports_regenerated_from_id_idx" ON "shift_photo_reports"("regenerated_from_id");

-- CreateIndex
CREATE INDEX "shifts_status_ends_at_auto_photo_report_status_deleted_at_idx" ON "shifts"("status", "ends_at", "auto_photo_report_status", "deleted_at");

-- AddForeignKey
ALTER TABLE "shift_photo_reports" ADD CONSTRAINT "shift_photo_reports_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_photo_reports" ADD CONSTRAINT "shift_photo_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_photo_reports" ADD CONSTRAINT "shift_photo_reports_regenerated_from_id_fkey" FOREIGN KEY ("regenerated_from_id") REFERENCES "shift_photo_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
