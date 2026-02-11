# Prisma -> Frontend Type Boundary Guide

## What Was Refactored (Shifts)
We moved shift typing away from UI-local Prisma-shaped types and into a shared frontend DTO contract.

### Completed changes
- Added shared shift DTOs in `apps/web/types/shifts.ts`:
  - `ShiftEmployeeSummary`
  - `ShiftWithRelationsDto`
  - `SerializedShiftWithRelationsDto`
- Removed cross-feature type coupling:
  - Employee pages/hooks no longer import types from `apps/web/app/admin/(authenticated)/shifts/components/shift-list.tsx`.
- Replaced generic serialization boundary for shifts:
  - `apps/web/app/admin/(authenticated)/shifts/page.tsx` now explicitly maps Prisma results to DTOs.
  - Date fields are converted intentionally (`toISOString()`), not implicitly via `JSON.stringify`.

## Why This Pattern
- Prisma models are database contracts, not UI/API contracts.
- Frontend should depend on stable DTOs, not component-local types.
- Explicit mapping makes Date and JSON behavior obvious and testable.

## What To Do Next (Attendance)
Targets:
- `apps/web/app/admin/(authenticated)/attendance/page.tsx`
- `apps/web/app/admin/(authenticated)/attendance/components/attendance-list.tsx`

### 1. Introduce attendance DTOs
Create `apps/web/types/attendance.ts` with types like:
- `AttendanceMetadataDto`
- `AttendanceWithRelationsDto`
- `AttendanceEmployeeSummary`

Prefer precise metadata typing over `any`.
Example shape:
- `location?: { lat: number; lng: number }`
- `latenessMins?: number`

### 2. Map explicitly in page.tsx
In `attendance/page.tsx`, replace:
- `serialize(attendances)`
- `serialize(employees)`

with explicit mapping:
- Convert `recordedAt`, `shift.date`, etc. to ISO strings.
- Normalize nullable relations (`employee`, `shift`).
- Normalize `metadata` to typed DTO (`AttendanceMetadataDto | null`).

### 3. Remove Prisma imports from client components
In `attendance-list.tsx`, avoid using `Attendance`, `Shift`, `Site`, `ShiftType` from `@prisma/client` for props.
Use DTO types from `apps/web/types/attendance.ts`.

### 4. Fix location type guard bug
Current guard in `attendance-list.tsx` checks `lat/lng` on the wrong level.
- It currently checks fields directly on input object.
- But usage passes `attendance.metadata?.location`.
Use one consistent approach:
- either `hasValidLocation(location)` for `{lat,lng}`
- or `hasLocation(metadata)` for `{ location: {lat,lng} }`

### 5. Repeat for office attendance
Apply same DTO + explicit mapper pattern to:
- `apps/web/app/admin/(authenticated)/attendance/office/page.tsx`
- `apps/web/app/admin/(authenticated)/attendance/office/components/office-attendance-list.tsx`

## Rollout Rule for Other Entities
For each entity page:
1. Define DTO in `apps/web/types/*`.
2. Map Prisma -> DTO in server page/route.
3. Pass DTO props to client components.
4. Keep JSON columns (`metadata`, `details`) as typed objects + runtime guards.
5. Avoid importing `@prisma/client` model types in client component prop contracts.
