ALTER TABLE "office_attendance" ADD COLUMN "business_date" DATE;

UPDATE "office_attendance" oa
SET "business_date" = os."date"
FROM "office_shifts" os
WHERE oa."office_shift_id" = os."id"
  AND oa."business_date" IS NULL;

UPDATE "office_attendance"
SET "business_date" = ("recorded_at" AT TIME ZONE 'Asia/Makassar')::date
WHERE "business_date" IS NULL;

CREATE INDEX "office_attendance_business_date_idx" ON "office_attendance"("business_date");
CREATE INDEX "office_attendance_employee_id_business_date_idx" ON "office_attendance"("employee_id", "business_date");
