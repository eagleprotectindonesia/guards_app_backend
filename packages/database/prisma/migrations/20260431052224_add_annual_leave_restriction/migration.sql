CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "employee_leave_requests"
DROP CONSTRAINT IF EXISTS "employee_leave_requests_pending_no_overlap";

ALTER TABLE "employee_leave_requests"
ADD CONSTRAINT "employee_leave_requests_pending_no_overlap"
EXCLUDE USING gist (
  "employee_id" WITH =,
  daterange("start_date", "end_date", '[]') WITH &&
)
WHERE ("status" IN ('pending', 'pending_hr', 'pending_manager'));