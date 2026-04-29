-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeaveRequestStatus" ADD VALUE 'pending_hr';
ALTER TYPE "LeaveRequestStatus" ADD VALUE 'pending_manager';

-- AlterTable
ALTER TABLE "employee_leave_requests" ADD COLUMN     "hr_approval_note" TEXT,
ADD COLUMN     "hr_approved_at" TIMESTAMP(3),
ADD COLUMN     "hr_approved_by_id" TEXT,
ADD COLUMN     "manager_approval_note" TEXT,
ADD COLUMN     "manager_approved_at" TIMESTAMP(3),
ADD COLUMN     "manager_approved_by_id" TEXT;

-- AddForeignKey
ALTER TABLE "employee_leave_requests" ADD CONSTRAINT "employee_leave_requests_manager_approved_by_id_fkey" FOREIGN KEY ("manager_approved_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_requests" ADD CONSTRAINT "employee_leave_requests_hr_approved_by_id_fkey" FOREIGN KEY ("hr_approved_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
