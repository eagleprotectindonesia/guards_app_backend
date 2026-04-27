/*
  Warnings:

  - A unique constraint covering the columns `[office_shift_id,status]` on the table `office_attendance` will be added. If there are existing duplicate values, this will fail.
*/


-- CreateIndex
CREATE UNIQUE INDEX "office_attendance_shift_status_key" ON "office_attendance"("office_shift_id", "status");

