# Leave Requests Backend Guide

## Purpose

This document is the source of truth for employee leave-request backend behavior and should be used as the baseline for future leave-related tasks.

## Scope (v1)

- Employee can submit leave request.
- Authorized admin can approve/reject leave request.
- Employee can cancel own pending request.
- Admin visibility/action control can use per-admin ownership mapping (see `docs/ADMIN_OWNERSHIP_LEAVE_REQUESTS.md`).
- On approval, operational effects are applied automatically:
  - `office` employee: create `EmployeeOfficeDayOverride` with `overrideType = off` for every approved date.
  - `on_site` employee: cancel overlapping future scheduled shifts.

Out of scope in v1:

- Leave balance/accrual/quota.
- Partial-day leave.
- Multi-step approval chains.

## Data Model

### Prisma Enum

- `LeaveRequestStatus`
  - `pending`
  - `approved`
  - `rejected`
  - `cancelled`
- `LeaveRequestReason`
  - `sick`
  - `casual`
  - `emergency`

### Prisma Model

- `EmployeeLeaveRequest`
  - `id`
  - `employeeId`
  - `startDate` (`DATE`)
  - `endDate` (`DATE`)
  - `reason` (`LeaveRequestReason`)
  - `note` (optional text)
  - `attachments` (`string[]`, S3 keys)
  - `status`
  - `reviewedById`
  - `reviewedAt`
  - `reviewNote`
  - `cancelledAt`
  - `createdAt`
  - `updatedAt`

Indexes:

- `(employeeId, startDate)`
- `(status, createdAt)`
- `(startDate, endDate)`

## RBAC

Resource: `leave-requests`

Permission codes:

- `leave-requests:view`
- `leave-requests:create`
- `leave-requests:edit`
- `leave-requests:delete`

Usage:

- Admin leave-requests page data loading requires `leave-requests:view`.
- Admin approve/reject server actions require `leave-requests:edit`.
- Super admin bypasses ownership and role-scope filters.
- Leave visibility/edit is constrained by ownership resolver using ownership domain `leave` (details in `docs/ADMIN_OWNERSHIP_LEAVE_REQUESTS.md`).

## API Contracts

### Employee APIs

- `GET /api/employee/my/leave-requests`
  - Returns authenticated employee’s own requests.

- `POST /api/employee/my/leave-requests`
  - Body:
    - `startDate` (YYYY-MM-DD)
    - `endDate` (YYYY-MM-DD)
    - `reason` (`sick` | `casual` | `emergency`)
    - `note` (optional)
    - `attachments` (optional, max 4 S3 keys)
  - Creates request with status `pending`.

- `POST /api/employee/my/leave-requests/:id/cancel`
  - Cancels own request only if status is `pending`.

### Admin Server Actions and Page Load

- `apps/web/app/admin/(authenticated)/leave-requests/page.tsx`
  - Reads filters (`statuses`, `employeeId`, `startDate`, `endDate`) from page search params.
  - Applies leave ownership resolver before querying leave requests.
  - Returns only requests visible to current admin.

- `approveLeaveRequestAction(requestId, adminNote?)`
  - File: `apps/web/app/admin/(authenticated)/leave-requests/actions.ts`
  - Hard ownership check before mutation.
  - Approves pending request and applies operational effects.

- `rejectLeaveRequestAction(requestId, adminNote)`
  - File: `apps/web/app/admin/(authenticated)/leave-requests/actions.ts`
  - Hard ownership check before mutation.
  - Rejects pending request.

## Admin Ownership Reference

- For ownership data model, matching rules, conflict resolution, fallback queue, and rollout:
  - `docs/ADMIN_OWNERSHIP_LEAVE_REQUESTS.md`

## Business Rules

- Date range is inclusive (`startDate` and `endDate` included).
- Validation requires `startDate <= endDate`.
- State transitions:
  - `pending -> approved`
  - `pending -> rejected`
  - `pending -> cancelled` (employee action)
- Any non-pending request cannot be approved/rejected/cancelled.

## Approval Side Effects

### Office employees

For each approved date key in `[startDate..endDate]`:

- Upsert `EmployeeOfficeDayOverride` as `off`.
- Add note linked to leave request id.

### On-site employees

- Find overlapping future shifts for employee where:
  - status is `scheduled`
  - not soft-deleted
  - shift date intersects leave range
  - shift starts in the future
- Update them to `status = cancelled`.
- Publish shift update event (`events:shifts`) for downstream schedulers/realtime consumers.

## Audit and Observability

- Create/update actions are logged to `Changelog` with entity type `EmployeeLeaveRequest`.
- Approval changelog includes effect counts (office overrides, on-site shifts cancelled).

## Files Implemented

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260421090000_add_employee_leave_requests/migration.sql`
- `packages/database/prisma/migrations/20260421120000_add_admin_leave_ownership/migration.sql`
- `packages/database/src/repositories/leave-requests.ts`
- `packages/database/src/repositories/admin-ownership.ts`
- `packages/database/src/repositories/index.ts`
- `packages/validations/src/index.ts`
- `apps/web/lib/auth/permissions.ts`
- `apps/web/lib/auth/leave-ownership.ts`
- `apps/web/lib/feature-flags.ts`
- `packages/database/prisma/seed-rbac.ts`
- `apps/web/app/api/employee/my/leave-requests/route.ts`
- `apps/web/app/api/employee/my/leave-requests/[id]/cancel/route.ts`
- `apps/web/app/admin/(authenticated)/leave-requests/page.tsx`
- `apps/web/app/admin/(authenticated)/leave-requests/actions.ts`
- `apps/web/app/admin/(authenticated)/leave-requests/components/leave-request-detail.tsx`
- `apps/web/app/admin/(authenticated)/admins/actions.ts`
- `apps/web/app/admin/(authenticated)/admins/components/admin-form.tsx`
- `apps/web/app/admin/(authenticated)/admins/create/page.tsx`
- `apps/web/app/admin/(authenticated)/admins/[id]/edit/page.tsx`

## Future Task Backlog

1. Add leave-request UI in employee app (create/list/cancel).
2. Add admin leave-request management UI (list/filter/approve/reject).
3. Add notifications:
   - notify employee when approved/rejected.
   - notify approvers when new request is created.
4. Add conflict rules before submission:
   - prevent duplicate overlapping pending requests.
5. Add assignment analytics dashboard:
   - unmatched employee count
   - ownership coverage per department/office
   - conflict preview for newly added assignments
6. Add full test suite:
   - repository unit tests for transitions + side effects
   - server action tests for auth/scope/errors
   - integration tests for scheduling effects
7. Add reporting/export endpoint for leave analytics.
8. Add leave type taxonomy (`annual`, `sick`, etc.) if business requires.
9. Add idempotency keys for approval/rejection action safety under retries.

## Operational Notes

- Apply schema migration before using leave-request flows.
- Re-seed RBAC permissions to ensure `leave-requests:*` exists for role assignment.
- If full monorepo lint fails due to unrelated workspace issues, validate at least:
  - `pnpm --filter @repo/database type-check`
  - `pnpm --filter web type-check`
