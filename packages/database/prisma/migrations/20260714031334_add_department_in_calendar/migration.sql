-- AlterEnum
ALTER TYPE "ChangelogActor" ADD VALUE 'employee';

-- DropIndex
DROP INDEX "calendar_events_dept_names_active_gin";

-- DropIndex
DROP INDEX "calendar_events_tagged_department_names_gin";

-- DropIndex
DROP INDEX "changelogs_entity_type_entity_id_idx";

-- AlterTable
ALTER TABLE "changelogs" ADD COLUMN     "employee_id" TEXT;

-- CreateIndex
CREATE INDEX "changelogs_entity_type_entity_id_created_at_idx" ON "changelogs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "changelogs_employee_id_idx" ON "changelogs"("employee_id");

-- AddForeignKey
ALTER TABLE "changelogs" ADD CONSTRAINT "changelogs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
