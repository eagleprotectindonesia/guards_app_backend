CREATE TYPE "OfficeDayOverrideType" AS ENUM ('off', 'shift_override');

CREATE TABLE "employee_office_day_overrides" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "override_type" "OfficeDayOverrideType" NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT,
    "last_updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_office_day_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_office_day_overrides_employee_id_date_key"
ON "employee_office_day_overrides"("employee_id", "date");

CREATE INDEX "employee_office_day_overrides_employee_id_date_idx"
ON "employee_office_day_overrides"("employee_id", "date");

ALTER TABLE "employee_office_day_overrides"
ADD CONSTRAINT "employee_office_day_overrides_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_office_day_overrides"
ADD CONSTRAINT "employee_office_day_overrides_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_office_day_overrides"
ADD CONSTRAINT "employee_office_day_overrides_last_updated_by_id_fkey"
FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
