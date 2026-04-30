CREATE TABLE "employee_onsite_day_offs" (
  "id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "note" TEXT,
  "created_by_id" TEXT,
  "last_updated_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "employee_onsite_day_offs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_onsite_day_offs_employee_id_date_key"
ON "employee_onsite_day_offs"("employee_id", "date");

CREATE INDEX "employee_onsite_day_offs_employee_id_date_idx"
ON "employee_onsite_day_offs"("employee_id", "date");

ALTER TABLE "employee_onsite_day_offs"
ADD CONSTRAINT "employee_onsite_day_offs_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_onsite_day_offs"
ADD CONSTRAINT "employee_onsite_day_offs_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "admins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_onsite_day_offs"
ADD CONSTRAINT "employee_onsite_day_offs_last_updated_by_id_fkey"
FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
