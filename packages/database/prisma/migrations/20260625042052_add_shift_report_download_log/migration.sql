-- CreateEnum
CREATE TYPE "ShiftPhotoReportDownloadMode" AS ENUM ('single', 'bulk');

-- CreateTable
CREATE TABLE "shift_photo_report_downloads" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "report_number" TEXT,
    "shift_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "mode" "ShiftPhotoReportDownloadMode" NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "downloaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_photo_report_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_photo_report_downloads_report_id_downloaded_at_idx" ON "shift_photo_report_downloads"("report_id", "downloaded_at");

-- CreateIndex
CREATE INDEX "shift_photo_report_downloads_admin_id_downloaded_at_idx" ON "shift_photo_report_downloads"("admin_id", "downloaded_at");

-- CreateIndex
CREATE INDEX "shift_photo_report_downloads_downloaded_at_idx" ON "shift_photo_report_downloads"("downloaded_at");

-- CreateIndex
CREATE INDEX "shift_photo_report_downloads_shift_id_idx" ON "shift_photo_report_downloads"("shift_id");

-- AddForeignKey
ALTER TABLE "shift_photo_report_downloads" ADD CONSTRAINT "shift_photo_report_downloads_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "shift_photo_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_photo_report_downloads" ADD CONSTRAINT "shift_photo_report_downloads_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
