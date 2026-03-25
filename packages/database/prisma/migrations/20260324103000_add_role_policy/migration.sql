ALTER TABLE "roles"
ADD COLUMN IF NOT EXISTS "policy" JSONB;

UPDATE "roles"
SET "policy" = CASE
  WHEN "employee_visibility_scope" = 'on_site_only' THEN
    jsonb_build_object(
      'employees', jsonb_build_object('scope', 'on_site_only'),
      'attendance', jsonb_build_object('scope', 'shift_only')
    )
  ELSE
    jsonb_build_object(
      'employees', jsonb_build_object('scope', 'all'),
      'attendance', jsonb_build_object('scope', 'all')
    )
END
WHERE "policy" IS NULL;
