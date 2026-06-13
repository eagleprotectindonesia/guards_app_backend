CREATE TABLE "ticket_assigned_employees" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "match_keyword" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_assigned_employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_assigned_employees_ticket_id_employee_id_key"
ON "ticket_assigned_employees"("ticket_id", "employee_id");

CREATE INDEX "ticket_assigned_employees_employee_id_idx"
ON "ticket_assigned_employees"("employee_id");

CREATE INDEX "ticket_assigned_employees_ticket_id_created_at_idx"
ON "ticket_assigned_employees"("ticket_id", "created_at");

ALTER TABLE "ticket_assigned_employees"
ADD CONSTRAINT "ticket_assigned_employees_ticket_id_fkey"
FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_assigned_employees"
ADD CONSTRAINT "ticket_assigned_employees_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
