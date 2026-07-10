-- Add CHECK constraint ensuring exactly one of employee_id or admin_id is set
ALTER TABLE "calendar_events"
ADD CONSTRAINT "calendar_events_owner_check"
CHECK (num_nonnulls("employee_id", "admin_id") = 1);
