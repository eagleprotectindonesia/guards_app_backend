# Office Employee Scheduling

This document describes the office employee scheduling system used for office attendance.

It covers:
- how office work schedules are modeled
- how employee-specific future schedule changes work
- how office attendance resolves the active schedule
- how admin UI manages default schedules, templates, and employee schedule assignments

## Overview

Office employees do not record attendance against shifts.

Instead:
- `on_site` employees use shift-based attendance
- `office` employees use daily attendance rules based on an office work schedule

An office work schedule is a reusable weekly template:
- each weekday can be marked as working or non-working
- working days define `startTime` and `endTime`
- overnight windows are allowed, so `endTime` may be earlier than `startTime` when the shift continues into the next day

At runtime, office attendance resolves the effective schedule for the employee on the attendance date:
- if the employee has an active schedule assignment on that date, use that schedule
- otherwise use the system default office schedule

## Data Model

### 1. Office Work Schedule Template

Defined in:
- [`packages/database/prisma/schema.prisma`](/home/tian/Documents/Work/guards_app_backend/packages/database/prisma/schema.prisma)
- [`packages/database/src/repositories/office-work-schedules.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-work-schedules.ts)

Main tables:

#### `office_work_schedules`

Template header.

Key fields:
- `id`
- `code`
- `name`

Example:
- `Default Office Schedule`
- `Finance Team Schedule`
- `Back Office 6-Day Schedule`

#### `office_work_schedule_days`

Per-weekday rules for a template.

Key fields:
- `schedule_id`
- `weekday`
- `is_working_day`
- `start_time`
- `end_time`

Weekday convention:
- `0 = Sunday`
- `1 = Monday`
- `2 = Tuesday`
- `3 = Wednesday`
- `4 = Thursday`
- `5 = Friday`
- `6 = Saturday`

### 2. Employee Schedule Assignment Timeline

Future-effective employee schedule changes are modeled through:

#### `employee_office_work_schedule_assignments`

Key fields:
- `employee_id`
- `office_work_schedule_id`
- `effective_from`
- `effective_until`

This table is the canonical source of truth for employee-specific office schedule assignment.

Meaning:
- `effective_from`: when the assignment starts
- `effective_until = null`: open-ended assignment
- `effective_until != null`: assignment ends at that date boundary

Timeline rule:
- assignment windows for the same employee must not overlap

### 3. Default Schedule

The default schedule is identified through:
- `system_settings.DEFAULT_OFFICE_WORK_SCHEDULE_ID`

Seeded default:
- Monday-Friday working
- Saturday-Sunday off
- `08:00-17:00`

## Schedule Resolution

Implemented in:
- [`packages/database/src/repositories/office-work-schedules.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-work-schedules.ts)

Core flow:

1. Resolve business day in `BUSINESS_TIMEZONE`
2. Find an employee assignment active at that date/time
3. If found, use its schedule template
4. Otherwise, use the default office schedule
5. Load the weekday rule for that business day
6. Derive:
   - whether the day is a working day
   - start minutes
   - end minutes
   - whether the clock-in is late
   - whether the end of the day has passed

Important helpers:
- `getDefaultOfficeWorkSchedule()`
- `getOfficeWorkScheduleAssignmentForDate(employeeId, at)`
- `getCurrentOfficeWorkScheduleAssignment(employeeId, at)`
- `getUpcomingOfficeWorkScheduleAssignment(employeeId, at)`
- `listOfficeWorkScheduleAssignments(employeeId)`
- `scheduleFutureOfficeWorkScheduleAssignment(...)`
- `resolveOfficeWorkScheduleContextForEmployee(employeeId, at)`

## Future-Effective Assignment Behavior

### Example

HR wants to change an employee from:
- `Default Office Schedule`

to:
- `Finance Team Schedule`

starting next Monday.

The backend flow is:

1. Create a new assignment row with:
   - `office_work_schedule_id = Finance Team Schedule`
   - `effective_from = next Monday`
2. Find the currently active assignment before that date
3. Automatically set the previous row’s `effective_until = next Monday`

Result:
- current schedule remains active until Sunday
- new schedule becomes active starting Monday

`effective_until` is backend-managed in the normal schedule-change flow.

### Multi-Step Future Timeline Behavior

Employees can have multiple future schedule assignments.

Timeline rules:
- assignment windows for the same employee must not overlap
- same employee + same `effective_from` + same schedule: no-op
- same employee + same `effective_from` + different schedule: replace that row
- new future assignment before another scheduled future row: insert it into the timeline

When inserting a new future assignment:
1. Find the immediate previous assignment whose active window reaches the new `effective_from`
2. Find the immediate next assignment after the new `effective_from`
3. Set the previous row’s `effective_until = new effective_from`
4. Create the new row
5. If a next row exists, set the new row’s `effective_until = next row effective_from`

Example:
- existing row A: `2026-04-14 -> ongoing`
- admin inserts row B starting `2026-04-01`

Result:
- previous active row ends at `2026-04-01`
- row B runs from `2026-04-01 -> 2026-04-14`
- row A still starts at `2026-04-14`

## Office Attendance Rules

Implemented in:
- [`apps/web/app/api/employee/my/office-attendance/route.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/api/employee/my/office-attendance/route.ts)
- [`packages/database/src/repositories/office-attendance.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-attendance.ts)

Rules for office employees:

### Working Day Enforcement

Attendance is allowed only when the resolved schedule says the current business day is a working day.

### Time Enforcement

Clock-in behavior:
- before start time: allowed
- after start but before end: allowed and marked late
- after end time: rejected
- for overnight windows, the backend treats the window as spanning into the next calendar day

Clock-out behavior:
- only allowed after a same-day clock-in exists
- for overnight windows, "same day" means the active schedule window, not just the calendar date

### Daily State Machine

Per employee, per business day:
- first record must be `present`
- `clocked_out` before `present` is rejected
- duplicate `present` is rejected
- duplicate `clocked_out` is rejected
- once the day is completed, more records are rejected

### Late Metadata

Late office attendance stores:
- `metadata.latenessMins`

### Location Rules

If the office employee has an assigned office:
- geofence validation applies
- location is required

If the office employee has no assigned office:
- no location restriction applies
- `office_attendance.office_id` may be `null`

## Admin Frontend

Implemented in:
- [`apps/web/app/admin/(authenticated)/settings/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/settings/page.tsx)
- [`apps/web/app/admin/(authenticated)/office-work-schedules/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-work-schedules/page.tsx)
- [`apps/web/app/admin/(authenticated)/employees/[id]/edit/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/employees/[id]/edit/page.tsx)

### 1. Default Schedule Editor

Location:
- `/admin/settings`

Purpose:
- edit the weekday rules of the system default office schedule

This does not require admins to manually edit the raw `DEFAULT_OFFICE_WORK_SCHEDULE_ID` setting.

### 2. Reusable Template Management

Location:
- `/admin/office-work-schedules`

Purpose:
- create and edit reusable office schedule templates

Admin can:
- create template name
- configure 7 weekday rules
- reuse templates for many employees

### 3. Employee Schedule Timeline

Location:
- `/admin/employees/[id]/edit`

Purpose:
- view the employee’s assignment timeline
- add and manage future schedule timeline entries

Displayed:
- employee name
- employee code
- past/current/upcoming schedule assignments
- timeline entry form with:
  - template selection
  - `effectiveFrom`
- row actions for upcoming assignments:
  - edit
  - delete

The UI does not ask for `effectiveUntil`; backend manages that automatically, including when a new entry is inserted before an already scheduled future change.

Editing and deleting rules:
- upcoming assignments can be edited
- upcoming assignments can be deleted
- current assignments cannot be edited directly
- past assignments cannot be edited or deleted

Operational rule for HR:
- if the employee is already on the schedule today and HR needs a change, create a new assignment starting tomorrow instead of editing the active row
- deleting an upcoming row extends the previous custom row to the deleted row’s former `effectiveUntil` when a previous custom row exists
- if there is no previous custom row, deleting the first upcoming row causes the employee to fall back to the default office schedule until the next custom row

### 4. Bulk CSV Assignment Import

Location:
- employee schedule management UI

Purpose:
- assign or update future office schedule timelines for multiple employees in one import

CSV headers:
- `employee_number`
- `schedule_name`
- `effective_from`

Import behavior:
- all-or-nothing transaction
- exact employee number and exact schedule name matching
- same employee + same date + same schedule: no-op
- same employee + same date + different schedule: replace that future assignment
- multiple future dates for the same employee are allowed
- duplicate `employee_number + effective_from` rows in one file are rejected
- rows are grouped by employee and sorted by `effective_from` before applying the timeline updates

## Permissions

Frontend permission resource:
- `office-work-schedules`

Permission codes:
- `office-work-schedules:view`
- `office-work-schedules:create`
- `office-work-schedules:edit`
- `office-work-schedules:delete`

Default schedule editing remains tied to:
- `system-settings:view`
- `system-settings:edit`

Employee schedule assignment remains tied to:
- `employees:edit`

## Validation

Shared validation lives in:
- [`packages/validations/src/index.ts`](/home/tian/Documents/Work/guards_app_backend/packages/validations/src/index.ts)

Important schemas:
- `updateOfficeWorkScheduleSchema`
- `updateDefaultOfficeWorkScheduleSchema`
- `createEmployeeOfficeWorkScheduleAssignmentSchema`

Validation rules:
- exactly 7 weekday rules required
- working day requires both `startTime` and `endTime`
- `endTime` must be after `startTime`
- employee assignment requires:
  - valid schedule template id
  - valid `effectiveFrom`

## Seeds And Migrations

Relevant migrations:
- [`packages/database/prisma/migrations/20260327090000_add_office_work_schedules/migration.sql`](/home/tian/Documents/Work/guards_app_backend/packages/database/prisma/migrations/20260327090000_add_office_work_schedules/migration.sql)
- [`packages/database/prisma/migrations/20260328030732_add_employee_schedule_assignments/migration.sql`](/home/tian/Documents/Work/guards_app_backend/packages/database/prisma/migrations/20260328030732_add_employee_schedule_assignments/migration.sql)

Relevant seeds:
- [`packages/database/prisma/seed.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/prisma/seed.ts)
- [`packages/database/prisma/seed-rbac.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/prisma/seed-rbac.ts)

What gets seeded:
- default office schedule template
- weekday rows for the default schedule
- `DEFAULT_OFFICE_WORK_SCHEDULE_ID`
- office schedule permissions

## Testing

Current focused tests:
- [`apps/web/tests/office-attendance-api.test.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/tests/office-attendance-api.test.ts)
- [`apps/web/tests/office-work-schedule-actions.test.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/tests/office-work-schedule-actions.test.ts)
- [`packages/database/src/repositories/office-work-schedules.test.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-work-schedules.test.ts)

Covered scenarios:
- attendance blocked on non-working days
- late clock-in metadata
- clock-out-before-clock-in rejection
- office geofence rejection
- assignment-based schedule resolution
- future assignment bounding previous active assignment
- structured admin action payloads for schedule editing and assignment creation

## Operational Notes

- The employee external sync does not own office schedule assignments.
- Office schedule templates are reusable and independent from employee master data.
- Employee assignment history is preserved in the assignment table.
- Future changes should always be created through the assignment timeline, not by mutating the active schedule directly for one employee.

## Related Files

- [`packages/database/src/repositories/office-work-schedules.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-work-schedules.ts)
- [`apps/web/app/api/employee/my/office-attendance/route.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/api/employee/my/office-attendance/route.ts)
- [`apps/web/app/admin/(authenticated)/office-work-schedules/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-work-schedules/page.tsx)
- [`apps/web/app/admin/(authenticated)/employees/[id]/edit/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/employees/[id]/edit/page.tsx)
