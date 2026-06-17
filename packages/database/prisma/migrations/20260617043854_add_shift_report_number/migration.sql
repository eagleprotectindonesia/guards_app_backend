/*
  Warnings:

  - A unique constraint covering the columns `[report_number]` on the table `shift_photo_reports` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "shift_photo_reports" ADD COLUMN     "report_number" TEXT;

-- CreateTable
CREATE TABLE "shift_photo_report_daily_sequences" (
    "date_key" VARCHAR(10) NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_photo_report_daily_sequences_pkey" PRIMARY KEY ("date_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_photo_reports_report_number_key" ON "shift_photo_reports"("report_number");
