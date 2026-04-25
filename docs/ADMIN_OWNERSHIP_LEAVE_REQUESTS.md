# Admin Ownership Domains

## Purpose

This document defines the per-admin employee ownership model used by admin leave-management actions and employee visibility APIs.

## Scope

- Ownership is assigned per admin (not per role).
- Supported ownership domains:
  - `leave`
  - `employees` (employee list/export visibility)
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
- `domain` (`leave` | `employees`)
- `departmentKey` (nullable, normalized)
- `officeId` (nullable)
- `priority` (`INTEGER`, lower means higher priority)
- `isActive`
- `createdAt`
- `updatedAt`

Constraints and indexes:

- At least one scope dimension required (`departmentKey` or `officeId`).
- Unique scope per admin and domain: (`admin_id`, `domain`, `department_key`, `office_id`) normalized via SQL expression index.
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

Note:
- `leave` domain supports shared visibility for overlapping scopes. If multiple admins match the same employee scope, each matching admin can view/review that leave request.
- `employees` domain remains exclusive/deterministic using the precedence below.

When multiple assignments could match an employee, owner is selected by ordered precedence:

1. `priority` ascending
2. specificity descending (`department+office` before single-dimension)
3. `createdAt` ascending
4. `adminId` lexicographically
5. `assignment id` lexicographically

The first matching assignment in this sorted order is the owner.

## Fallback Queue

If no assignment matches an employee:

- in `leave` domain: employee is visible only to admins with `includeFallbackLeaveQueue = true`
- in `employees` domain: unmatched employees are hidden for non-super-admins
- super admin can always view and act regardless of ownership/fallback

## Enforcement Surface

Ownership is enforced in:

- `apps/web/app/admin/(authenticated)/leave-requests/page.tsx` (list/filter data loading)
- `approveLeaveRequestAction` in `apps/web/app/admin/(authenticated)/leave-requests/actions.ts`
- `rejectLeaveRequestAction` in `apps/web/app/admin/(authenticated)/leave-requests/actions.ts`
- employee visibility is enforced in:
  - admin employees page list query
  - admin employee export query

For approve/reject, ownership is checked before mutation and non-owned requests return not found.

## Admin Management UX

Admin create/edit form supports separate sections:

- Leave Ownership:
  - owned departments
  - owned offices
  - fallback queue toggle
- Employee Visibility Ownership:
  - visible departments
  - visible offices

Server actions normalize and replace assignment sets atomically per domain.

## Rollout Guidance

1. Deploy schema and code.
2. Populate leave and employees domain assignments.
3. Verify leave fallback assignees and employee visibility coverage.
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
- `apps/web/app/admin/(authenticated)/leave-requests/page.tsx`
- `apps/web/app/admin/(authenticated)/leave-requests/actions.ts`
