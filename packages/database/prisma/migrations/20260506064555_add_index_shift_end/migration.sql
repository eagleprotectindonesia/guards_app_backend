-- AlterTable
ALTER TABLE "office_shifts" ADD COLUMN     "end_reminder_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "end_reminder_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "office_shifts_status_ends_at_end_reminder_sent_at_deleted_a_idx" ON "office_shifts"("status", "ends_at", "end_reminder_sent_at", "deleted_at");

-- CreateIndex
CREATE INDEX "shifts_status_ends_at_end_reminder_sent_at_deleted_at_idx" ON "shifts"("status", "ends_at", "end_reminder_sent_at", "deleted_at");
