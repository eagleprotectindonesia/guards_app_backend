-- AlterTable
ALTER TABLE "employee_office_work_schedule_assignments" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "last_updated_by_id" TEXT;

-- AlterTable
ALTER TABLE "office_work_schedules" ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "last_updated_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "office_work_schedules" ADD CONSTRAINT "office_work_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_work_schedules" ADD CONSTRAINT "office_work_schedules_last_updated_by_id_fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_office_work_schedule_assignments" ADD CONSTRAINT "employee_office_work_schedule_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_office_work_schedule_assignments" ADD CONSTRAINT "employee_office_work_schedule_assignments_last_updated_by__fkey" FOREIGN KEY ("last_updated_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
