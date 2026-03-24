DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeVisibilityScope') THEN
        CREATE TYPE "EmployeeVisibilityScope" AS ENUM ('all', 'on_site_only');
    END IF;
END $$;

ALTER TABLE "roles"
ADD COLUMN IF NOT EXISTS "employee_visibility_scope" "EmployeeVisibilityScope" NOT NULL DEFAULT 'all';
