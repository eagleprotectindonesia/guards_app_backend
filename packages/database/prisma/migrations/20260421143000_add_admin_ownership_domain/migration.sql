-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdminOwnershipDomain') THEN
    CREATE TYPE "AdminOwnershipDomain" AS ENUM ('leave', 'employees');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "admin_ownership_assignments"
ADD COLUMN IF NOT EXISTS "domain" "AdminOwnershipDomain" NOT NULL DEFAULT 'leave';

-- Backfill safeguard for pre-existing rows
UPDATE "admin_ownership_assignments"
SET "domain" = 'leave'
WHERE "domain" IS NULL;

-- Replace old indexes with domain-aware indexes
DROP INDEX IF EXISTS "admin_ownership_assignments_admin_id_is_active_idx";
DROP INDEX IF EXISTS "admin_ownership_assignments_department_key_is_active_idx";
DROP INDEX IF EXISTS "admin_ownership_assignments_office_id_is_active_idx";

CREATE INDEX IF NOT EXISTS "admin_ownership_assignments_admin_id_domain_is_active_idx"
ON "admin_ownership_assignments"("admin_id", "domain", "is_active");

CREATE INDEX IF NOT EXISTS "admin_ownership_assignments_domain_department_key_is_active_idx"
ON "admin_ownership_assignments"("domain", "department_key", "is_active");

CREATE INDEX IF NOT EXISTS "admin_ownership_assignments_domain_office_id_is_active_idx"
ON "admin_ownership_assignments"("domain", "office_id", "is_active");

-- Update unique scope to include domain
DROP INDEX IF EXISTS "admin_ownership_assignments_admin_id_scope_uniq";
CREATE UNIQUE INDEX IF NOT EXISTS "admin_ownership_assignments_admin_id_domain_scope_uniq"
ON "admin_ownership_assignments"(
  "admin_id",
  "domain",
  COALESCE("department_key", ''),
  COALESCE("office_id", '')
);
