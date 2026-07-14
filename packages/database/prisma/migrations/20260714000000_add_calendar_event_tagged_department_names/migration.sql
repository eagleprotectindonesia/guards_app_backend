-- AlterTable: Add taggedDepartmentNames array to calendar_events
ALTER TABLE "calendar_events" ADD COLUMN "tagged_department_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex: Index on employee.department for faster fan-out queries
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex: GIN index for fast ANY() lookups on tagged_department_names
CREATE INDEX "calendar_events_tagged_department_names_gin"
  ON "calendar_events" USING GIN ("tagged_department_names");

-- CreateIndex: Partial GIN index for the employee calendar aggregation hot path
-- (events not deleted, with department tags, within date range)
CREATE INDEX "calendar_events_dept_names_active_gin"
  ON "calendar_events" USING GIN ("tagged_department_names")
  WHERE "deleted_at" IS NULL;
