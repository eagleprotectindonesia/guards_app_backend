/*
  Warnings:

  - You are about to drop the column `office_work_schedule_id` on the `employees` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_office_work_schedule_id_fkey";

-- DropIndex
DROP INDEX "employees_office_work_schedule_id_idx";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "office_work_schedule_id";

-- CreateTable
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

-- CreateIndex
CREATE INDEX "employee_office_schedule_assignments_employee_from_idx" ON "employee_office_work_schedule_assignments"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "employee_office_schedule_assignments_employee_until_idx" ON "employee_office_work_schedule_assignments"("employee_id", "effective_until");

-- CreateIndex
CREATE INDEX "employee_office_schedule_assignments_schedule_idx" ON "employee_office_work_schedule_assignments"("office_work_schedule_id");

-- AddForeignKey
ALTER TABLE "employee_office_work_schedule_assignments" ADD CONSTRAINT "employee_office_work_schedule_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_office_work_schedule_assignments" ADD CONSTRAINT "employee_office_work_schedule_assignments_office_work_sche_fkey" FOREIGN KEY ("office_work_schedule_id") REFERENCES "office_work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
