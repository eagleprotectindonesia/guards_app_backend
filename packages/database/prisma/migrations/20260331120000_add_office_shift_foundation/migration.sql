CREATE TYPE "OfficeAttendanceMode" AS ENUM ('shift_based', 'fixed_schedule');

ALTER TABLE "employees"
ADD COLUMN "office_attendance_mode" "OfficeAttendanceMode";

UPDATE "employees"
SET "office_attendance_mode" = 'shift_based'
WHERE "role" = 'office' AND "office_attendance_mode" IS NULL;

CREATE TABLE "office_shift_types" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "last_updated_by_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "office_shift_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "office_shifts" (
  "id" TEXT NOT NULL,
  "office_shift_type_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "status" "ShiftStatus" NOT NULL DEFAULT 'scheduled',
  "grace_minutes" INTEGER NOT NULL DEFAULT 15,
  "created_by_id" TEXT,
  "last_updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "note" TEXT,

  CONSTRAINT "office_shifts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "office_attendance"
ADD COLUMN "office_shift_id" TEXT;

CREATE UNIQUE INDEX "office_shift_types_name_key" ON "office_shift_types"("name");
CREATE INDEX "office_shift_types_deleted_at_idx" ON "office_shift_types"("deleted_at");

CREATE INDEX "office_shifts_employee_id_starts_at_idx" ON "office_shifts"("employee_id", "starts_at");
CREATE INDEX "office_shifts_starts_at_ends_at_idx" ON "office_shifts"("starts_at", "ends_at");
CREATE INDEX "office_shifts_employee_id_status_starts_at_idx" ON "office_shifts"("employee_id", "status", "starts_at");
CREATE INDEX "office_shifts_employee_id_status_ends_at_idx" ON "office_shifts"("employee_id", "status", "ends_at");
CREATE INDEX "office_shifts_deleted_at_idx" ON "office_shifts"("deleted_at");

CREATE INDEX "office_attendance_office_shift_id_idx" ON "office_attendance"("office_shift_id");

ALTER TABLE "office_shift_types"
ADD CONSTRAINT "office_shift_types_last_updated_by_id_fkey"
FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "office_shift_types"
ADD CONSTRAINT "office_shift_types_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "office_shifts"
ADD CONSTRAINT "office_shifts_office_shift_type_id_fkey"
FOREIGN KEY ("office_shift_type_id") REFERENCES "office_shift_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "office_shifts"
ADD CONSTRAINT "office_shifts_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "office_shifts"
ADD CONSTRAINT "office_shifts_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "office_shifts"
ADD CONSTRAINT "office_shifts_last_updated_by_id_fkey"
FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "office_attendance"
ADD CONSTRAINT "office_attendance_office_shift_id_fkey"
FOREIGN KEY ("office_shift_id") REFERENCES "office_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
