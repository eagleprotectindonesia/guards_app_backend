CREATE TYPE "OfficeAttendanceStatus" AS ENUM (
  'present',
  'absent',
  'late',
  'pending_verification',
  'clocked_out',
  'pending_leave',
  'leave'
);

ALTER TABLE "office_attendance"
ADD COLUMN "status_new" "OfficeAttendanceStatus";

UPDATE "office_attendance"
SET "status_new" = "status"::text::"OfficeAttendanceStatus";

ALTER TABLE "office_attendance"
ALTER COLUMN "status_new" SET NOT NULL;

ALTER TABLE "office_attendance"
DROP CONSTRAINT IF EXISTS "office_attendance_shift_status_key";

ALTER TABLE "office_attendance"
DROP COLUMN "status";

ALTER TABLE "office_attendance"
RENAME COLUMN "status_new" TO "status";

CREATE UNIQUE INDEX "office_attendance_shift_status_key"
ON "office_attendance"("office_shift_id", "status");
