/*
  Robust Migration for Production
  1. Handles Enum value additions safely.
  2. Maps old roles to new roles with data preservation.
  3. Uses idempotent logic for database objects.
*/

-- 1. Safely add AttendanceStatus value (Postgres doesn't allow this in a multi-command transaction block sometimes)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'AttendanceStatus' AND e.enumlabel = 'clocked_out') THEN
        ALTER TYPE "AttendanceStatus" ADD VALUE 'clocked_out';
    END IF;
END $$;

-- 2. Handle EmployeeRole migration
-- Create the new type first
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeRole_new') THEN
        CREATE TYPE "EmployeeRole_new" AS ENUM ('on_site', 'office');
    END IF;
END $$;

-- Alter designations table (map old values)
-- Check if role column exists first. If it doesn't exist, we will add it later.
-- In our case, designations.role didn't exist in psql \d, so we add it.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='designations' AND column_name='role') THEN
        ALTER TABLE "designations" ADD COLUMN "role" "EmployeeRole_new" NOT NULL DEFAULT 'on_site';
    ELSE
        ALTER TABLE "designations" ALTER COLUMN "role" TYPE "EmployeeRole_new" USING (
          CASE 
            WHEN "role"::text = 'manager' THEN 'office'::"EmployeeRole_new"
            ELSE 'on_site'::"EmployeeRole_new"
          END
        );
    END IF;
END $$;

-- Alter employees table (map old values)
ALTER TABLE "employees" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "employees" ALTER COLUMN "role" TYPE "EmployeeRole_new" USING (
  CASE 
    WHEN "role"::text = 'manager' THEN 'office'::"EmployeeRole_new"
    WHEN "role"::text IS NULL THEN NULL
    ELSE 'on_site'::"EmployeeRole_new"
  END
);

-- Swap the types
ALTER TYPE "EmployeeRole" RENAME TO "EmployeeRole_old";
ALTER TYPE "EmployeeRole_new" RENAME TO "EmployeeRole";
DROP TYPE "EmployeeRole_old";

-- 3. Final structural changes
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "office_id" TEXT;
ALTER TABLE "employees" ALTER COLUMN "role" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "role" DROP DEFAULT;

-- 4. Create Tables (Idempotent)
CREATE TABLE IF NOT EXISTS "offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" BOOLEAN DEFAULT true,
    "last_updated_by_id" TEXT,
    "created_by_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "office_attendance" (
    "id" TEXT NOT NULL,
    "office_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "picture" TEXT,
    "status" "AttendanceStatus" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_attendance_pkey" PRIMARY KEY ("id")
);

-- Indices (Idempotent)
CREATE INDEX IF NOT EXISTS "offices_status_idx" ON "offices"("status");
CREATE INDEX IF NOT EXISTS "offices_deleted_at_idx" ON "offices"("deleted_at");
CREATE INDEX IF NOT EXISTS "office_attendance_recorded_at_idx" ON "office_attendance"("recorded_at");
CREATE INDEX IF NOT EXISTS "office_attendance_employee_id_idx" ON "office_attendance"("employee_id");
CREATE INDEX IF NOT EXISTS "office_attendance_office_id_idx" ON "office_attendance"("office_id");

-- Foreign Keys (Idempotent approach: drop then add or check)
-- Employees -> Offices
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_office_id_fkey";
ALTER TABLE "employees" ADD CONSTRAINT "employees_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Offices -> Admins (Last Updated)
ALTER TABLE "offices" DROP CONSTRAINT IF EXISTS "offices_last_updated_by_id_fkey";
ALTER TABLE "offices" ADD CONSTRAINT "offices_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Offices -> Admins (Created By)
ALTER TABLE "offices" DROP CONSTRAINT IF EXISTS "offices_created_by_id_fkey";
ALTER TABLE "offices" ADD CONSTRAINT "offices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Office Attendance -> Offices
ALTER TABLE "office_attendance" DROP CONSTRAINT IF EXISTS "office_attendance_office_id_fkey";
ALTER TABLE "office_attendance" ADD CONSTRAINT "office_attendance_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Office Attendance -> Employees
ALTER TABLE "office_attendance" DROP CONSTRAINT IF EXISTS "office_attendance_employee_id_fkey";
ALTER TABLE "office_attendance" ADD CONSTRAINT "office_attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;