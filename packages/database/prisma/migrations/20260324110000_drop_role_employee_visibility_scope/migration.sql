ALTER TABLE "roles"
DROP COLUMN IF EXISTS "employee_visibility_scope";

DROP TYPE IF EXISTS "EmployeeVisibilityScope";
