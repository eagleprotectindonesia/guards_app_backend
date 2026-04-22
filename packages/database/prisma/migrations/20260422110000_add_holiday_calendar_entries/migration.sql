CREATE TYPE "HolidayCalendarType" AS ENUM ('holiday', 'week_off', 'emergency', 'special_working_day');
CREATE TYPE "HolidayCalendarScope" AS ENUM ('all', 'department');

CREATE TABLE "holiday_calendar_entries" (
    "id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "type" "HolidayCalendarType" NOT NULL,
    "scope" "HolidayCalendarScope" NOT NULL,
    "department_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "affects_attendance" BOOLEAN NOT NULL DEFAULT true,
    "notification_required" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_by_id" TEXT,
    "last_updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holiday_calendar_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "holiday_calendar_entries_date_range_check" CHECK ("end_date" >= "start_date"),
    CONSTRAINT "holiday_calendar_entries_scope_department_keys_check" CHECK (
      ("scope" = 'all' AND COALESCE(array_length("department_keys", 1), 0) = 0)
      OR
      ("scope" = 'department' AND COALESCE(array_length("department_keys", 1), 0) > 0)
    )
);

CREATE INDEX "holiday_calendar_entries_start_date_idx" ON "holiday_calendar_entries"("start_date");
CREATE INDEX "holiday_calendar_entries_end_date_idx" ON "holiday_calendar_entries"("end_date");
CREATE INDEX "holiday_calendar_entries_type_idx" ON "holiday_calendar_entries"("type");
CREATE INDEX "holiday_calendar_entries_scope_idx" ON "holiday_calendar_entries"("scope");

ALTER TABLE "holiday_calendar_entries" ADD CONSTRAINT "holiday_calendar_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "holiday_calendar_entries" ADD CONSTRAINT "holiday_calendar_entries_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
