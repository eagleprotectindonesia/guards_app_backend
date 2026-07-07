-- AlterEnum
ALTER TYPE "AdminNotificationType" ADD VALUE 'calendar_event_reminder';

-- AlterTable
ALTER TABLE "calendar_events"
ADD COLUMN "reminder_minutes_before" INTEGER,
ADD COLUMN "reminder_scheduled_at" TIMESTAMPTZ(6),
ADD COLUMN "reminder_sent_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "calendar_events_reminder_scheduled_at_reminder_sent_at_idx"
ON "calendar_events"("reminder_scheduled_at", "reminder_sent_at");
