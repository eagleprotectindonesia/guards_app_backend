# Office Shift Scheduling

This document describes office shift overrides used for office attendance.

It covers:
- how office day overrides are modeled
- how office shift types and office shifts are stored
- how office attendance resolves the active office shift
- how admin UI manages office shift types, office shifts, off-day overrides, and bulk CSV import

## Overview

Office employees no longer choose between separate attendance modes.

Instead:
- baseline office schedules define the default attendance expectation
- office day overrides define per-date exceptions
- working dates may be overridden by office shifts
- non-working dates may be overridden by explicit off-day records

Baseline scheduling remains documented in:
- [`docs/OFFICE_EMPLOYEE_SCHEDULING.md`](/home/tian/Documents/Work/guards_app_backend/docs/OFFICE_EMPLOYEE_SCHEDULING.md)

## Data Model

Defined in:
- [`packages/database/prisma/schema.prisma`](/home/tian/Documents/Work/guards_app_backend/packages/database/prisma/schema.prisma)
- [`packages/database/src/repositories/office-shifts.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-shifts.ts)
- [`packages/database/src/repositories/office-shift-types.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-shift-types.ts)
- [`packages/database/src/repositories/office-attendance-context.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-attendance-context.ts)

### 1. Office Day Overrides

Table:
- `employee_office_day_overrides`

Purpose:
- stores the explicit day-level intent for office attendance resolution

Override types:
- `off`
- `shift_override`

Rules:
- one employee may have only one override row per date
- `off` blocks attendance for that anchor date
- `shift_override` tells attendance resolution to use `office_shifts` for that date instead of the baseline schedule

### 2. Office Shift Types

Table:
- `office_shift_types`

Purpose:
- reusable office shift templates with named time windows

Key fields:
- `id`
- `name`
- `start_time`
- `end_time`

Notes:
- overnight windows are allowed
- `end_time` may be earlier than `start_time` to indicate next-day completion

### 3. Office Shifts

Table:
- `office_shifts`

Purpose:
- concrete scheduled office shifts assigned to office employees

Key fields:
- `office_shift_type_id`
- `employee_id`
- `date`
- `starts_at`
- `ends_at`
- `attendance_mode`
- `status`
- `note`

Rules:
- one employee may have multiple office shifts in one day
- office shifts for the same employee must not overlap
- office shifts are office-based and do not use `site_id`
- `attendance_mode` is nullable; `null` means inherit the employee-level office attendance policy
- explicit shift attendance mode overrides are only valid for office employees with an assigned office

### 4. Office Attendance Link

Table:
- `office_attendance`

Additional relation:
- `office_shift_id`

Purpose:
- persist which office shift a shift-derived attendance record belongs to

This makes attendance history stable even if shift data changes later.

## Attendance Resolution

Implemented in:
- [`packages/database/src/repositories/office-attendance-context.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-attendance-context.ts)

Override-aware flow:
1. Load employee role
2. Resolve the current and previous anchor-date office day overrides
3. If the current anchor date is `off`, return non-working-day context
4. If the relevant anchor date is `shift_override`, resolve from office shift context
5. Otherwise fall back to office work schedule context

For shift override dates:
1. Find relevant office shifts for the employee in the current business-day window
2. Restrict matching to dates explicitly marked as `shift_override`
3. Prefer the active office shift if one is currently in progress
4. Otherwise use the nearest relevant shift in that business day context
5. Derive:
   - `isWorkingDay`
   - `windowStart`
   - `windowEnd`
   - `isLate`
   - `isAfterEnd`
   - `effectiveAttendanceMode`
   - `attendancePolicySource`

Important helpers:
- `resolveOfficeAttendanceContextForEmployee(employeeId, at)`
- `resolveOfficeShiftContextForEmployee(employeeId, at)`
- `findRelevantOfficeShiftForEmployee(employeeId, at)`
- `getScheduledPaidMinutesForOfficeAttendance(employeeId, at)`

## Office Attendance Rules For Shift Override Dates

Implemented in:
- [`apps/web/app/api/employee/my/office-attendance/route.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/api/employee/my/office-attendance/route.ts)
- [`apps/web/app/api/employee/my/office-attendance/today/route.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/api/employee/my/office-attendance/today/route.ts)

Rules:
- clock-in is allowed only within the resolved office shift window
- clock-in after shift end is rejected
- clock-out requires an earlier `present` record in the active shift window or same business day fallback logic
- duplicate `present` and duplicate `clocked_out` are rejected
- `missed` is still derived, not stored as a separate row

Late metadata:
- `metadata.latenessMins`

Attendance relation:
- `officeAttendance.officeShiftId` is stored when the attendance came from a shift-derived office window

## Location Enforcement

Shift-derived office attendance may override the employee-level location policy.

Validation is based on:
- `officeShift.attendanceMode`
- `employee.fieldModeEnabled`
- `employee.officeId`

Behavior:
- if the active shift has `attendance_mode = office_required`, geofence validation uses the assigned office
- if the active shift has `attendance_mode = non_office`, attendance may be recorded from anywhere
- if the active shift has `attendance_mode = null`, behavior falls back to the employee-level policy
- if there is no assigned office, attendance remains non-office and shift overrides are ignored

## Admin UI

Implemented in:
- [`apps/web/app/admin/(authenticated)/office-shift-types/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shift-types/page.tsx)
- [`apps/web/app/admin/(authenticated)/office-shifts/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shifts/page.tsx)

Admin capabilities:
- manage office shift types
- create, edit, delete, and cancel office shifts
- bulk import office shifts by CSV
- apply date-specific working overrides for office employees
- backend supports hidden shift-level attendance mode overrides, but admin entry points do not expose them yet

### Bulk CSV Import

Implemented in:
- [`apps/web/app/admin/(authenticated)/office-shifts/actions.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shifts/actions.ts)
- [`apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx)

Supported headers:
- `employee_code`
- `shift_type_name`
- `date`
- `note`

Validation rules:
- employee must exist
- employee must be `role = office`
- office shift type name must exist
- date must be valid
- generated shift window must not overlap existing office shifts
- generated shift window must not overlap another row in the same upload batch

Import behavior:
- all-or-nothing
- multiple same-day office shifts are allowed for one employee if they do not overlap

## Permissions

Office shift admin uses separate resources:
- `office-shifts:*`
- `office-shift-types:*`

These are distinct from guard scheduling permissions:
- `shifts:*`
- `shift-types:*`
