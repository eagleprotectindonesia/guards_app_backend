-- Extend leave status enum for annual dual approval workflow
ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS 'pending_hr';
ALTER TYPE "LeaveRequestStatus" ADD VALUE IF NOT EXISTS 'pending_manager';

-- Track per-stage approvers for annual leave
ALTER TABLE "employee_leave_requests"
ADD COLUMN "manager_approved_by_id" TEXT,
ADD COLUMN "manager_approved_at" TIMESTAMP(3),
ADD COLUMN "manager_approval_note" TEXT,
ADD COLUMN "hr_approved_by_id" TEXT,
ADD COLUMN "hr_approved_at" TIMESTAMP(3),
ADD COLUMN "hr_approval_note" TEXT;

ALTER TABLE "employee_leave_requests"
ADD CONSTRAINT "employee_leave_requests_manager_approved_by_id_fkey"
FOREIGN KEY ("manager_approved_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_leave_requests"
ADD CONSTRAINT "employee_leave_requests_hr_approved_by_id_fkey"
FOREIGN KEY ("hr_approved_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep overlap protection for all in-progress leave requests
ALTER TABLE "employee_leave_requests"
DROP CONSTRAINT IF EXISTS "employee_leave_requests_pending_no_overlap";

ALTER TABLE "employee_leave_requests"
ADD CONSTRAINT "employee_leave_requests_pending_no_overlap"
EXCLUDE USING gist (
  "employee_id" WITH =,
  daterange("start_date", "end_date", '[]') WITH &&
)
WHERE ("status" IN ('pending', 'pending_hr', 'pending_manager'));
