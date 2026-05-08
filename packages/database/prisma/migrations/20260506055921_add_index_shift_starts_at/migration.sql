-- AlterTable
ALTER TABLE "office_shifts" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "reminder_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "office_shifts_status_starts_at_reminder_sent_at_deleted_at_idx" ON "office_shifts"("status", "starts_at", "reminder_sent_at", "deleted_at");

-- CreateIndex
CREATE INDEX "shifts_status_starts_at_reminder_sent_at_deleted_at_idx" ON "shifts"("status", "starts_at", "reminder_sent_at", "deleted_at");
