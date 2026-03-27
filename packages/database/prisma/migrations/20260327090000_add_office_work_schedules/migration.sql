ALTER TABLE "employees" ADD COLUMN "office_work_schedule_id" TEXT;

ALTER TABLE "office_attendance" ALTER COLUMN "office_id" DROP NOT NULL;

CREATE TABLE "office_work_schedules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_work_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "office_work_schedule_days" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "is_working_day" BOOLEAN NOT NULL DEFAULT false,
    "start_time" TEXT,
    "end_time" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_work_schedule_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "office_work_schedules_code_key" ON "office_work_schedules"("code");
CREATE UNIQUE INDEX "office_work_schedules_name_key" ON "office_work_schedules"("name");
CREATE UNIQUE INDEX "office_work_schedule_days_schedule_id_weekday_key" ON "office_work_schedule_days"("schedule_id", "weekday");
CREATE INDEX "employees_office_work_schedule_id_idx" ON "employees"("office_work_schedule_id");
CREATE INDEX "office_work_schedule_days_schedule_id_idx" ON "office_work_schedule_days"("schedule_id");

ALTER TABLE "employees" ADD CONSTRAINT "employees_office_work_schedule_id_fkey" FOREIGN KEY ("office_work_schedule_id") REFERENCES "office_work_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "office_work_schedule_days" ADD CONSTRAINT "office_work_schedule_days_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "office_work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "office_attendance" DROP CONSTRAINT IF EXISTS "office_attendance_office_id_fkey";
ALTER TABLE "office_attendance" ADD CONSTRAINT "office_attendance_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "office_work_schedules" ("id", "code", "name", "updated_at")
VALUES ('6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 'default-office-work-schedule', 'Default Office Schedule', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "code" = EXCLUDED."code",
  "name" = EXCLUDED."name",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "office_work_schedule_days" ("id", "schedule_id", "weekday", "is_working_day", "start_time", "end_time", "updated_at")
VALUES
  ('b631da57-ea40-41d8-ab66-9bc521727d01', '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 0, false, NULL, NULL, CURRENT_TIMESTAMP),
  ('b631da57-ea40-41d8-ab66-9bc521727d02', '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 1, true, '08:00', '17:00', CURRENT_TIMESTAMP),
  ('b631da57-ea40-41d8-ab66-9bc521727d03', '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 2, true, '08:00', '17:00', CURRENT_TIMESTAMP),
  ('b631da57-ea40-41d8-ab66-9bc521727d04', '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 3, true, '08:00', '17:00', CURRENT_TIMESTAMP),
  ('b631da57-ea40-41d8-ab66-9bc521727d05', '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 4, true, '08:00', '17:00', CURRENT_TIMESTAMP),
  ('b631da57-ea40-41d8-ab66-9bc521727d06', '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 5, true, '08:00', '17:00', CURRENT_TIMESTAMP),
  ('b631da57-ea40-41d8-ab66-9bc521727d07', '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80', 6, false, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("schedule_id", "weekday") DO UPDATE SET
  "is_working_day" = EXCLUDED."is_working_day",
  "start_time" = EXCLUDED."start_time",
  "end_time" = EXCLUDED."end_time",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "system_settings" ("name", "value", "note")
VALUES (
  'DEFAULT_OFFICE_WORK_SCHEDULE_ID',
  '6e3be3df-698b-4d5c-aa42-2ddf01fb9d80',
  'Default office work schedule template used when an office employee has no assigned custom office schedule.'
)
ON CONFLICT ("name") DO UPDATE SET
  "value" = EXCLUDED."value",
  "note" = EXCLUDED."note";
