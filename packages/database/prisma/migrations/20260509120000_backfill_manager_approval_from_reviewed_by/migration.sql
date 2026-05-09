-- Backfill manager approval data for approved leave requests that were finalized directly by a manager.
UPDATE "employee_leave_requests"
SET
  "manager_approved_by_id" = "reviewed_by_id",
  "manager_approved_at" = "reviewed_at",
  "manager_approval_note" = COALESCE("manager_approval_note", "admin_note")
WHERE "status" = 'approved'
  AND "manager_approved_at" IS NULL
  AND "reviewed_by_id" IS NOT NULL
  AND "reviewed_at" IS NOT NULL;
