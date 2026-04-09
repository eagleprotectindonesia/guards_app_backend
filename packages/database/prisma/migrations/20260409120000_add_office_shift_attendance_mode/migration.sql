CREATE TYPE "OfficeShiftAttendanceMode" AS ENUM ('office_required', 'non_office');

ALTER TABLE "office_shifts"
ADD COLUMN "attendance_mode" "OfficeShiftAttendanceMode";
