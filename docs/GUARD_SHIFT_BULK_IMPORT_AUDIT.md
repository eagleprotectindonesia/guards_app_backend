# Guard Shift Bulk Import Audit

This document audits the guard/onsite bulk shift import flow implemented in
[`packages/database/src/repositories/shifts.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/shifts.ts).

Scope:
- only `on_site` / guard shifts
- excludes office shifts and office attendance scheduling
- covers the CSV upload path used by the admin guard-shifts screen

## Entry Points

- [`apps/web/app/admin/(authenticated)/guard-shifts/actions.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/guard-shifts/actions.ts)
- [`packages/database/src/repositories/shifts.ts`](/home/tian/Documents/Work/guards_app_backend/packages/database/src/repositories/shifts.ts)

Calling route/server action:
- `POST` via the Admin guard-shifts server action in [`apps/web/app/admin/(authenticated)/guard-shifts/actions.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/app/admin/(authenticated)/guard-shifts/actions.ts)
- server action name: `bulkImportGuardShiftsAction` as implemented in that file

The UI parses CSV rows, validates the required headers, and then calls `processGuardShiftBulkImport(rows, { adminId })`.

## Data Model Assumptions

The import path is built around the regular `shift` table, not a dedicated guard bulk-import table.

Important assumptions:
- imported employees must exist and must have `role = 'on_site'`
- imported dates are stored as `YYYY-MM-DD`
- shift templates come from `shiftType.name`
- `off` is a sentinel row type, not a real shift type

## Import Flow

### 1. Preload lookup data

The importer loads:
- active sites
- active shift types
- active `on_site` employees matching the uploaded employee codes

It then builds in-memory maps:
- site name -> site id
- shift type name -> shift type row
- employee code -> employee id

### 2. Row validation

Each CSV row is validated before mutation:
- site must exist
- date must match `YYYY-MM-DD`
- employee code must resolve to an active on-site employee
- duplicate employee/date pairs inside the same upload are rejected
- `interval` must be a positive integer
- `grace` must be a non-negative integer
- shift type must exist for non-`off` rows

### 3. Existing shift resolution

The importer loads existing shifts for the affected employee/date set and groups them by:

`employeeId + date`

Behavior by row type:
- `off` row:
  - marks every existing shift on that employee/date for deletion
  - records the date as an explicit off day
- working row:
  - create when no existing shift is found
  - update when exactly one existing shift is found
  - fail validation when multiple existing shifts are found

### 4. Derived shift window

For working rows, the importer derives:
- `startsAt` from the shift type start time
- `endsAt` from the shift type end time
- overnight shifts are supported by rolling `endsAt` into the next day when needed

It also validates that:
- shift duration is a multiple of the requested interval
- shift duration allows at least two check-in slots

### 5. Persistence

There are two execution modes:

- with `adminId`
  - create rows go through `bulkCreateShiftsWithChangelog`
  - updates call `updateShiftWithChangelog`
  - deletions call `deleteShiftWithChangelog`
  - on-site day-off rows are upserted/deleted separately

- without `adminId`
  - the importer uses direct Prisma writes inside a transaction for the main shift table
  - changelog side effects are skipped

### 6. Post-processing

After the shift mutations, the importer reconciles approved leave coverage for affected employees over the affected date range.

## Bulk Create Path

`bulkCreateShiftsWithChangelog(shiftsToCreate, adminId)` performs:

1. `shift.createManyAndReturn(...)`
2. `changelog.createMany(...)` for one changelog row per created shift
3. Redis fan-out to each affected employee stream

The changelog details include:
- site name
- shift type name
- employee name
- shift date/window
- check-in interval and grace period
- note
- IDs for site, shift type, and employee

## Audit Findings

### High

1. The `adminId` path is not atomic across the full import.

   `processGuardShiftBulkImport()` performs deletes, updates, off-day writes, and bulk creates as separate operations when `adminId` is provided. Each helper has its own transaction boundary, so a failure after some rows have already been mutated can leave a partially applied import.

   This is the main reliability risk in the current design.

### Medium

2. The import path does not publish a dedicated batch-complete event.

   Individual shift creates/updates can emit Redis notifications, but the bulk importer itself does not emit a single import summary event. Downstream consumers must infer changes from per-shift updates and leave reconciliation.

3. `off` rows delete all existing shifts for that employee/date.

   That is a valid guard-day-off model, but it is aggressive. If future behavior allows multiple same-day shifts for a guard, an `off` row will remove all of them.

### Low

4. The importer trusts CSV site and shift type names after normalization only.

   Matching is case-insensitive but still exact on the normalized string. There is no aliasing or fuzzy matching.

5. `pastDatesSkipped` is based on `startsAt < now`, not the date key alone.

   That is correct for overnight shifts, but it means “past” is evaluated from the actual shift start timestamp, not just the calendar date.

## Practical Impact

For guard/on-site shift bulk upload, the current implementation is functionally solid for the happy path:
- it enforces role scoping
- it supports create/update/off handling
- it reconciles leave coverage after changes

The main thing to fix if stronger guarantees are needed is wrapping the `adminId` mutation path in a single transaction or redesigning the importer so it stages all changes before applying them.
