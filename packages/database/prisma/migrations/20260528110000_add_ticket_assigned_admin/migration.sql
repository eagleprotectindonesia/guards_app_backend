-- Add person-level assignee for ticket claim ownership
ALTER TABLE "tickets"
ADD COLUMN "assigned_admin_id" TEXT;

ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_assigned_admin_id_fkey"
FOREIGN KEY ("assigned_admin_id") REFERENCES "admins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tickets_assigned_admin_id_created_at_idx"
ON "tickets"("assigned_admin_id", "created_at");
