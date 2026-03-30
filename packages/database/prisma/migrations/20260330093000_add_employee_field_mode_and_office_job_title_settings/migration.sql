ALTER TABLE "employees"
ADD COLUMN "field_mode_enabled" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "system_settings" ("name", "value", "note")
VALUES
  (
    'OFFICE_JOB_TITLE_CATEGORY_MAP',
    '{"staff":[],"management":[]}',
    'Maps external office employee job titles into the staff and management categories.'
  ),
  (
    'OFFICE_ATTENDANCE_MAX_DISTANCE_METERS',
    '10',
    'Maximum allowed distance (in meters) between an office employee and office coordinates for future office attendance enforcement.'
  )
ON CONFLICT ("name") DO UPDATE SET
  "note" = EXCLUDED."note";
