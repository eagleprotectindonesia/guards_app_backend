-- CreateEnum
CREATE TYPE "CalendarEventKind" AS ENUM ('meeting', 'client_meeting', 'reminder', 'task', 'deadline', 'follow_up', 'training', 'personal_event', 'other');

-- CreateEnum
CREATE TYPE "TagParticipantType" AS ENUM ('employee', 'admin');

-- AlterEnum
ALTER TYPE "AdminNotificationType" ADD VALUE 'calendar_event_tagged';

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT,
    "admin_id" TEXT,
    "kind" "CalendarEventKind" NOT NULL DEFAULT 'personal_event',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "client_name" TEXT,
    "trainer_name" TEXT,
    "priority" TEXT DEFAULT 'normal',
    "color" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_tags" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "participant_type" "TagParticipantType" NOT NULL,
    "employee_id" TEXT,
    "admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_event_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_employee_id_start_date_idx" ON "calendar_events"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "calendar_events_employee_id_end_date_idx" ON "calendar_events"("employee_id", "end_date");

-- CreateIndex
CREATE INDEX "calendar_events_admin_id_start_date_idx" ON "calendar_events"("admin_id", "start_date");

-- CreateIndex
CREATE INDEX "calendar_events_admin_id_end_date_idx" ON "calendar_events"("admin_id", "end_date");

-- CreateIndex
CREATE INDEX "calendar_events_deleted_at_idx" ON "calendar_events"("deleted_at");

-- CreateIndex
CREATE INDEX "calendar_events_deleted_at_start_date_end_date_idx" ON "calendar_events"("deleted_at", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "calendar_event_tags_event_id_idx" ON "calendar_event_tags"("event_id");

-- CreateIndex
CREATE INDEX "calendar_event_tags_employee_id_idx" ON "calendar_event_tags"("employee_id");

-- CreateIndex
CREATE INDEX "calendar_event_tags_admin_id_idx" ON "calendar_event_tags"("admin_id");

-- CreateIndex
CREATE INDEX "calendar_event_tags_participant_type_employee_id_idx" ON "calendar_event_tags"("participant_type", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_tags_event_id_employee_id_key" ON "calendar_event_tags"("event_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_tags_event_id_admin_id_key" ON "calendar_event_tags"("event_id", "admin_id");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_tags" ADD CONSTRAINT "calendar_event_tags_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "calendar_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_tags" ADD CONSTRAINT "calendar_event_tags_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_tags" ADD CONSTRAINT "calendar_event_tags_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed user-calendar permissions
INSERT INTO "permissions" ("id", "action", "resource", "code", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'view',   'user-calendar', 'user-calendar:view',   'Can view user calendar', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'create', 'user-calendar', 'user-calendar:create', 'Can create calendar events', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'edit',   'user-calendar', 'user-calendar:edit',   'Can edit calendar events', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'delete', 'user-calendar', 'user-calendar:delete', 'Can delete calendar events', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
