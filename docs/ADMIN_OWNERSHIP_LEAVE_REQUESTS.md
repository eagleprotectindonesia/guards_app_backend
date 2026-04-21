# Admin Ownership for Leave Requests

## Purpose

This document defines the per-admin employee ownership model used by admin leave-request APIs and admin management UI.

## Scope

- Ownership is assigned per admin (not per role).
- Supported ownership dimensions:
  - `department` (normalized string key)
  - `office` (office id)
  - hybrid (`department + office`)
- Ownership resolution is exclusive and deterministic.
- Unmatched employees can be routed to a fallback queue.

## Data Model

### Admin field

- `includeFallbackLeaveQueue` (`BOOLEAN`, default `false`)

### AdminOwnershipAssignment

- `id`
- `adminId`
- `departmentKey` (nullable, normalized)
- `officeId` (nullable)
- `priority` (`INTEGER`, lower means higher priority)
- `isActive`
- `createdAt`
- `updatedAt`

Constraints and indexes:

- At least one scope dimension required (`departmentKey` or `officeId`).
- Unique scope per admin: (`admin_id`, `department_key`, `office_id`) normalized via SQL expression index.
- Lookup indexes:
  - `(admin_id, is_active)`
  - `(department_key, is_active)`
  - `(office_id, is_active)`

## Department Normalization

Department values are normalized before matching and persistence:

- trim leading/trailing whitespace
- collapse internal whitespace to single spaces
- lowercase

Example:

- `"  OPERATIONS   TEAM "` -> `"operations team"`

## Matching Rules

An assignment matches an employee when all provided assignment dimensions match:

- department-only assignment: employee normalized department must equal `departmentKey`
- office-only assignment: employee `officeId` must equal `officeId`
- hybrid assignment: both conditions above must pass

## Conflict Resolution (Deterministic)

When multiple assignments could match an employee, owner is selected by ordered precedence:

1. `priority` ascending
2. specificity descending (`department+office` before single-dimension)
3. `createdAt` ascending
4. `adminId` lexicographically
5. `assignment id` lexicographically

The first matching assignment in this sorted order is the owner.

## Fallback Queue

If no assignment matches an employee:

- employee is visible only to admins with `includeFallbackLeaveQueue = true`
- super admin can always view and act regardless of ownership/fallback

## Feature Flag

- Flag: `ENABLE_ADMIN_LEAVE_OWNERSHIP`
- Default: `false`
- Behavior:
  - `false`: leave APIs use legacy role-policy scope behavior
  - `true`: leave APIs enforce ownership resolver

## API Enforcement Surface

Ownership is enforced in:

- `GET /api/admin/leave-requests`
- `POST /api/admin/leave-requests/:id/approve`
- `POST /api/admin/leave-requests/:id/reject`

For approve/reject, ownership is checked before mutation and non-owned requests return not found.

## Admin Management UX

Admin create/edit form supports:

- selecting owned departments
- selecting owned offices
- toggling fallback queue inclusion

Server actions normalize and replace assignment sets atomically.

## Rollout Guidance

1. Deploy schema and code with `ENABLE_ADMIN_LEAVE_OWNERSHIP=false`.
2. Populate admin ownership assignments and fallback assignments.
3. Enable `ENABLE_ADMIN_LEAVE_OWNERSHIP=true`.
4. Monitor unmatched volume and fallback usage.

## Source Files

- `packages/database/prisma/migrations/20260421120000_add_admin_leave_ownership/migration.sql`
- `packages/database/prisma/schema.prisma`
- `packages/database/src/repositories/admin-ownership.ts`
- `apps/web/lib/auth/leave-ownership.ts`
- `apps/web/lib/feature-flags.ts`
- `apps/web/app/admin/(authenticated)/admins/actions.ts`
- `apps/web/app/admin/(authenticated)/admins/components/admin-form.tsx`
- `apps/web/app/admin/(authenticated)/admins/create/page.tsx`
- `apps/web/app/admin/(authenticated)/admins/[id]/edit/page.tsx`
- `apps/web/app/api/admin/leave-requests/route.ts`
- `apps/web/app/api/admin/leave-requests/[id]/approve/route.ts`
- `apps/web/app/api/admin/leave-requests/[id]/reject/route.ts`
