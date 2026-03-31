# Office Shift Scheduling

This document describes the `shift_based` office employee scheduling model used for office attendance.

It covers:
- how shift-based office employees are modeled
- how office shift types and office shifts are stored
- how office attendance resolves the active office shift
- how admin UI manages office shift types, office shifts, and bulk CSV import

## Overview

Office employees can now use one of two scheduling modes:
- `fixed_schedule`
- `shift_based`

This document is for `shift_based`.

In this mode:
- the employee still has `role = office`
- the employee has `officeAttendanceMode = shift_based`
- attendance eligibility comes from assigned office shifts, not office work schedule templates

`fixed_schedule` remains documented in:
- [`docs/OFFICE_EMPLOYEE_SCHEDULING.md`](/home/tian/Documents/Work/guards_app_backend/docs/OFFICE_EMPLOYEE_SCHEDULING.md)

## Data Model

Defined in:
- [`packages/database/prisma/schema.prisma`](/home/tian/Documents/Work/guards_app_backend/packages/database/prisma/schema.prisma)
- [`packages/database/src/repositories/office-shifts.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-shifts.ts)
- [`packages/database/src/repositories/office-shift-types.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-shift-types.ts)
- [`packages/database/src/repositories/office-attendance-context.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-attendance-context.ts)

### 1. Employee Mode

Shift-based office scheduling is enabled by:
- `employees.role = office`
- `employees.office_attendance_mode = shift_based`

Default behavior:
- newly created or synced office employees default to `shift_based`

Mode switching behavior:
- switching from `fixed_schedule -> shift_based` clears future office work schedule assignments
- switching from `shift_based -> fixed_schedule` clears future office shifts
- historical records are preserved

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
- `status`
- `grace_minutes`
- `note`

Rules:
- one employee may have multiple office shifts in one day
- office shifts for the same employee must not overlap
- office shifts are office-based and do not use `site_id`

### 4. Office Attendance Link

Table:
- `office_attendance`

Additional relation:
- `office_shift_id`

Purpose:
- persist which office shift a `shift_based` attendance record belongs to

This makes attendance history stable even if shift data changes later.

## Attendance Resolution

Implemented in:
- [`packages/database/src/repositories/office-attendance-context.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/office-attendance-context.ts)

Mode-aware flow:
1. Load employee role and `officeAttendanceMode`
2. If mode is `fixed_schedule`, resolve from office work schedule context
3. If mode is `shift_based`, resolve from office shift context
4. Return one common attendance window shape to the employee attendance APIs

For `shift_based` employees:
1. Find relevant office shifts for the employee in the current business-day window
2. Prefer the active office shift if one is currently in progress
3. Otherwise use the nearest relevant shift in that business day context
4. Derive:
   - `isWorkingDay`
   - `windowStart`
   - `windowEnd`
   - `isLate`
   - `isAfterEnd`

Important helpers:
- `resolveOfficeAttendanceContextForEmployee(employeeId, at)`
- `resolveOfficeShiftContextForEmployee(employeeId, at)`
- `findRelevantOfficeShiftForEmployee(employeeId, at)`
- `getScheduledPaidMinutesForOfficeAttendance(employeeId, at)`

## Office Attendance Rules For Shift-Based Office Employees

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
- `officeAttendance.officeShiftId` is stored when the attendance came from a shift-based office window

## Location Enforcement

Shift-based office attendance still uses office geofence rules, not shift location rules.

Validation is based on:
- `employee.fieldModeEnabled`
- `employee.officeId`

Behavior:
- if `fieldModeEnabled = false` and the employee has an assigned office, geofence validation uses that office
- if `fieldModeEnabled = true`, attendance may be recorded from anywhere
- if there is no assigned office, location comparison is skipped

## Admin UI

Implemented in:
- [`apps/web/app/admin/(authenticated)/office-shift-types/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shift-types/page.tsx)
- [`apps/web/app/admin/(authenticated)/office-shifts/page.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shifts/page.tsx)
- [`apps/web/app/admin/(authenticated)/employees/components/employee-office-attendance-mode-card.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/employees/components/employee-office-attendance-mode-card.tsx)

Admin capabilities:
- manage office shift types
- create, edit, delete, and cancel office shifts
- bulk import office shifts by CSV
- switch office employees between `shift_based` and `fixed_schedule`

### Bulk CSV Import

Implemented in:
- [`apps/web/app/admin/(authenticated)/office-shifts/actions.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shifts/actions.ts)
- [`apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/office-shifts/components/office-bulk-create-modal.tsx)

Supported headers:
- `employee_code`
- `shift_type_name`
- `date`
- `grace_minutes`
- `note`

Validation rules:
- employee must exist
- employee must be `role = office`
- employee must be `officeAttendanceMode = shift_based`
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
