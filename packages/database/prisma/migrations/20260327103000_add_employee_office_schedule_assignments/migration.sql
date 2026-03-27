CREATE TABLE "employee_office_work_schedule_assignments" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "office_work_schedule_id" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_office_work_schedule_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_office_work_schedule_assignments_employee_id_effective_from_idx"
ON "employee_office_work_schedule_assignments"("employee_id", "effective_from");

CREATE INDEX "employee_office_work_schedule_assignments_employee_id_effective_until_idx"
ON "employee_office_work_schedule_assignments"("employee_id", "effective_until");

CREATE INDEX "employee_office_work_schedule_assignments_office_work_schedule_id_idx"
ON "employee_office_work_schedule_assignments"("office_work_schedule_id");

ALTER TABLE "employee_office_work_schedule_assignments"
ADD CONSTRAINT "employee_office_work_schedule_assignments_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_office_work_schedule_assignments"
ADD CONSTRAINT "employee_office_work_schedule_assignments_office_work_schedule_id_fkey"
FOREIGN KEY ("office_work_schedule_id") REFERENCES "office_work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "employee_office_work_schedule_assignments" (
    "id",
    "employee_id",
    "office_work_schedule_id",
    "effective_from",
    "effective_until",
    "updated_at"
)
SELECT
    "id" || '-office-work-schedule-assignment',
    "id",
    "office_work_schedule_id",
    CURRENT_TIMESTAMP,
    NULL,
    CURRENT_TIMESTAMP
FROM "employees"
WHERE "office_work_schedule_id" IS NOT NULL;

ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_office_work_schedule_id_fkey";
DROP INDEX IF EXISTS "employees_office_work_schedule_id_idx";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "office_work_schedule_id";
