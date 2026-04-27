# Holiday and Announcements Technical Doc

## Purpose
This document describes the technical design for:
- Holiday calendar entries (admin-managed policy dates)
- Employee announcements feed (holiday + office memo)
- Office memo admin CRUD

## High-level Architecture
- Admin manages holiday entries at `/admin/holiday-calendars`.
- Admin manages office memos at `/admin/office-memos`.
- Employee mobile app reads announcements from `GET /api/employee/my/announcements`.
- API merges data sources into one response:
  - Holiday announcements from `holiday_calendar_entries`
  - Office memo announcements from `office_memos`

## Data Models

### Holiday (`holiday_calendar_entries`)
Key fields:
- `start_date`, `end_date`
- `title`, `type`
- `scope` (`all` | `department`)
- `department_keys`
- `is_paid`, `affects_attendance`, `notification_required`, `note`

### Office Memo (`office_memos`)
Key fields:
- `start_date`, `end_date`
- `title`, `message`
- `scope` (`all` | `department`)
- `department_keys`
- `is_active`
- `created_by_id`, `last_updated_by_id`

## Date Semantics
Dates are treated as day-based windows.

### Admin validation rules
For both holiday and memo inputs:
- `startDate` and `endDate` must be `YYYY-MM-DD`
- `startDate <= endDate`
- `scope = all` => `departmentKeys` must be empty
- `scope = department` => at least one `departmentKey`

### Office memo create page UX
- Default `startDate`: today
- Default `endDate`: one month after the selected `startDate`
- If user manually changes `endDate`, it is no longer auto-adjusted when `startDate` changes

## API Contract: Employee Announcements
Endpoint: `GET /api/employee/my/announcements`

Response shape:
- `announcements: Array<Announcement>`

Kinds:
- `holiday`
- `office_memo`

Shared fields:
- `id`, `kind`, `title`, `message`, `startsAt`, `endsAt`, `createdAt`

Kind-specific meta:
- `holiday.meta`: `holidayEntryId`, `holidayType`, `isPaid`, `affectsAttendance`, `notificationRequired`, `scope`
- `office_memo.meta`: `officeMemoId`, `scope`

Sorting:
- `startsAt` ascending
- then `createdAt` descending

## Mobile Consumption
Hook: `apps/mobile/src/hooks/useAnnouncements.ts`
- Supports discriminated union for `holiday | office_memo`
- Unread/seen logic is ID-based and shared across both kinds

Screen: `apps/mobile/app/announcements/index.tsx`
- Renders both kinds in one mixed list
- Uses kind-specific label and fallback summary text

## Admin Permissions
New RBAC resource: `office-memos`
- `office-memos:view`
- `office-memos:create`
- `office-memos:edit`
- `office-memos:delete`

Applied to:
- `/admin/office-memos` (view)
- create action/page (create)
- edit action/page (edit)
- delete action (delete)

## Main Files
- Holiday repository: `packages/database/src/repositories/holiday-calendar-entries.ts`
- Office memo repository: `packages/database/src/repositories/office-memos.ts`
- Employee announcements API: `apps/web/app/api/employee/my/announcements/route.ts`
- Office memo admin pages: `apps/web/app/admin/(authenticated)/office-memos/*`
- Mobile announcements hook/screen:
  - `apps/mobile/src/hooks/useAnnouncements.ts`
  - `apps/mobile/app/announcements/index.tsx`
