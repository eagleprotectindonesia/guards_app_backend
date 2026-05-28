DO $$ BEGIN
  CREATE TYPE "TicketClaimantType" AS ENUM ('ADMIN', 'EMPLOYEE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "tickets"
ADD COLUMN IF NOT EXISTS "claimed_by_type" "TicketClaimantType",
ADD COLUMN IF NOT EXISTS "claimed_by_admin_id" TEXT,
ADD COLUMN IF NOT EXISTS "claimed_by_employee_id" TEXT,
ADD COLUMN IF NOT EXISTS "claimed_at" TIMESTAMP(3);

UPDATE "tickets"
SET
  "claimed_by_type" = 'ADMIN',
  "claimed_by_admin_id" = "assigned_admin_id",
  "claimed_at" = COALESCE("claimed_at", NOW())
WHERE "assigned_admin_id" IS NOT NULL;

ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_claimed_by_admin_id_fkey"
FOREIGN KEY ("claimed_by_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_claimed_by_employee_id_fkey"
FOREIGN KEY ("claimed_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "tickets_claimed_by_admin_id_created_at_idx"
ON "tickets"("claimed_by_admin_id", "created_at");

CREATE INDEX IF NOT EXISTS "tickets_claimed_by_employee_id_created_at_idx"
ON "tickets"("claimed_by_employee_id", "created_at");

ALTER TABLE "ticket_history"
ADD COLUMN IF NOT EXISTS "actor_employee_id" TEXT;

ALTER TABLE "ticket_history"
ADD CONSTRAINT "ticket_history_actor_employee_id_fkey"
FOREIGN KEY ("actor_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tickets"
DROP CONSTRAINT IF EXISTS "tickets_claimed_by_consistency_check";

ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_claimed_by_consistency_check"
CHECK (
  (
    "claimed_by_type" IS NULL
    AND "claimed_by_admin_id" IS NULL
    AND "claimed_by_employee_id" IS NULL
  )
  OR (
    "claimed_by_type" = 'ADMIN'
    AND "claimed_by_admin_id" IS NOT NULL
    AND "claimed_by_employee_id" IS NULL
  )
  OR (
    "claimed_by_type" = 'EMPLOYEE'
    AND "claimed_by_employee_id" IS NOT NULL
    AND "claimed_by_admin_id" IS NULL
  )
);

ALTER TABLE "tickets" DROP COLUMN IF EXISTS "assigned_admin_id";
DROP INDEX IF EXISTS "tickets_assigned_admin_id_created_at_idx";
