# Leave Requests Backend Guide

## Purpose

This document is the source of truth for employee leave-request backend behavior and should be used as the baseline for future leave-related tasks.

## Scope (v2)

- Employee can submit leave request.
- Authorized admin can approve/reject leave request.
- Employee can cancel own pending request.
- Admin visibility/action control can use per-admin ownership mapping (see `docs/ADMIN_OWNERSHIP_LEAVE_REQUESTS.md`).
- On approval, operational effects are applied automatically:
  - `office` employee: create `EmployeeOfficeDayOverride` with `overrideType = off` for every approved date.
  - `on_site` employee: cancel overlapping future scheduled shifts.

Out of scope in v1:

- Partial-day leave.

## Data Model

### Prisma Enum

- `LeaveRequestStatus`
  - `pending`
  - `pending_hr`
  - `pending_manager`
  - `approved`
  - `rejected`
  - `cancelled`
- `LeaveRequestReason`
  - `sick`
  - `family_marriage`
  - `family_child_marriage`
  - `family_child_circumcision_baptism`
  - `family_death`
  - `family_spouse_death`
  - `special_maternity`
  - `special_miscarriage`
  - `special_paternity`
  - `special_emergency`
  - `annual`

### Prisma Model

- `EmployeeLeaveRequest`
  - `id`
  - `employeeId`
  - `startDate` (`DATE`)
  - `endDate` (`DATE`)
  - `reason` (`LeaveRequestReason`)
  - `note` (optional text)
  - `attachments` (`string[]`, S3 keys)
  - `cycleKey` (`DATE`, sick cycle start 21st anchor)
  - `requiresDocument` (`boolean`)
  - `isPaid` (`boolean?`)
  - `deductedAnnualDays` (`int`)
  - `unpaidDays` (`int`)
  - `policySnapshot` (`json`)
  - `documentVerifiedAt`
  - `documentVerifiedById`
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
- Super admin review staging follows manager path (does not bypass HR-required dual approval).
- Leave visibility/edit is constrained by ownership resolver using ownership domain `leave` (details in `docs/ADMIN_OWNERSHIP_LEAVE_REQUESTS.md`).
- HR/non-HR review split:
  - HR approver can approve/reject globally only for requests that require HR approval.
  - HR approver is blocked from approving/rejecting non-HR-required requests, even if ownership matches.
  - Non-HR-required requests must be reviewed through manager ownership scope.

## API Contracts

### Employee APIs

- `GET /api/employee/my/leave-requests`
  - Returns authenticated employee’s own requests.

- `POST /api/employee/my/leave-requests`
  - Body:
    - `startDate` (YYYY-MM-DD)
    - `endDate` (YYYY-MM-DD)
    - `reason` (leave subtype enum, e.g. `sick`, `family_marriage`, `special_emergency`, `annual`)
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
- Overlapping ownership note (`leave` domain): when multiple admins have matching scope (same department/office), all matching admins can view and review the leave request.

## Business Rules

- Date range is inclusive (`startDate` and `endDate` included).
- Validation requires `startDate <= endDate`.
- Fixed-duration leave types are strict exact length:
  - `family_marriage` = 3 days
  - `family_child_marriage` = 2 days
  - `family_child_circumcision_baptism` = 2 days
  - `family_death` = 2 days
  - `family_spouse_death` = 2 days
  - `special_paternity` = 2 days
  - `special_miscarriage` = 45 days
  - `special_maternity` = 90 days
- Gender rules:
  - `special_maternity` allowed for `female` only
  - `special_paternity` allowed for `male` only
- Document-required rules:
  - `special_miscarriage` requires attachment/document.
  - `sick` request exceeding 1 working day in any sick cycle (`21st -> 20th`) without attachment is auto-converted to `annual` during manager approval flow.
- State transitions:
  - `pending -> approved`
  - `pending -> rejected`
  - `pending -> cancelled` (employee action)
  - Dual approval (manager + HR) only when:
    - `reason` is included in system setting `LEAVE_REASONS_REQUIRE_HR_APPROVAL`, and
    - leave duration is more than 1 calendar day (inclusive range length > 1).
- Dual approval transitions:
  - manager-first flow: `pending -> pending_hr -> approved`
  - hr-first flow: `pending -> pending_manager -> approved`
- Authorization guardrails for review actions:
  - Super admin keeps global visibility/action access, but approval mode is treated as manager.
  - If request requires HR and actor is HR approver: allow without ownership match.
  - If request does not require HR and actor is HR approver: deny action (`Non-HR leave must be reviewed by manager ownership`).
  - Otherwise: ownership/fallback visibility check is required before approve/reject.
- Any non-pending request cannot be approved/rejected/cancelled.

## Approval Side Effects

### Policy evaluation outcome

- Working day mode for deductions:
  - `office`: office overrides only (`shift_override` counted as working day; no override means non-working), still filtered by holiday policy.
  - `on_site`: provisional 7-day baseline (all calendar days except explicit OFF records) at approval time when future shift coverage is incomplete, then reconciled to finalized shift coverage.
- Sick cycle is anchored by period `21st -> 20th`:
  - date `21..end-of-month` => cycle start = current month day 21
  - date `1..20` => cycle start = previous month day 21
- Multi-cycle sick requests are evaluated per cycle bucket (not only request start cycle).
- Sick policy:
  - no-document sick is allowed up to 1 working day per cycle
  - if a pending no-document sick request exceeds 1 working day in a cycle, manager approval converts it to `annual`
  - after conversion, annual policy is applied (including shortfall/unpaid behavior)
- `special_emergency` always deducts annual leave and rejects if balance is insufficient.
- `annual` leave deducts annual leave and rejects if balance is insufficient.
- Policy outcome is persisted (`isPaid`, `deductedAnnualDays`, `unpaidDays`, `policySnapshot`).
  - For `on_site`, `policySnapshot` also stores deduction confidence metadata:
    - `deductionMode` (`provisional` or `final`)
    - `coverageMissingDates` (future dates missing shift coverage at projection time)
    - `reconciledAt` and `reconciliationDeltaDays` after shift-based reconciliation

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
- Shift import/update flows also trigger on-site leave reconciliation for overlapping approved leaves to finalize provisional deductions.

## Audit and Observability

- Create/update actions are logged to `Changelog` with entity type `EmployeeLeaveRequest`.
- Approval changelog includes effect counts (office overrides, on-site shifts cancelled).

## Admin Notifications (New Request Created)

- Notification type: `leave_request_created`.
- Base recipients: all matching admins from leave ownership scope (`leave` domain). If no ownership match exists, fallback admins with `includeFallbackLeaveQueue = true` are used.
- Additional recipients for HR-required leave requests: admins whose role policy has `leaveRequests.annualApprover = 'hr'`.
  - HR-required condition matches approval rule above (reason in setting + duration > 1 day).
- Final recipient list is deduplicated by `adminId`.

## System Setting (DB-managed)

- Setting name: `LEAVE_REASONS_REQUIRE_HR_APPROVAL`
- Value format: JSON array string of `LeaveRequestReason` values.
  - Example: `["annual","special_emergency"]`
- Invalid/missing setting fallback: no reason requires HR approval.
- This setting is intended for direct DB updates (no admin UI).

## Files Implemented

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260427143000_leave_requests_v2_policy/migration.sql`
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

1. Add employee-facing notifications:
   - notify employee when approved/rejected.
2. Add assignment analytics dashboard:
   - unmatched employee count
   - ownership coverage per department/office
   - conflict preview for newly added assignments
3. Add full test suite:
   - repository unit tests for transitions + side effects
   - server action tests for auth/scope/errors
   - integration tests for scheduling effects
4. Add reporting/export endpoint for leave analytics.
5. Add leave type taxonomy (`annual`, `sick`, etc.) if business requires.
6. Add idempotency keys for approval/rejection action safety under retries.

## Operational Role-Policy Backfill

- Existing environments should ensure HR roles use `leaveRequests.annualApprover = 'hr'` so annual leave notifications include HR recipients.
- Use the backfill script:
  - `pnpm tsx packages/database/prisma/backfill-hr-annual-approver.ts`

## Operational Notes

- Apply schema migration before using leave-request flows.
- Re-seed RBAC permissions to ensure `leave-requests:*` exists for role assignment.
- Direct DB update examples for HR-required reasons:
  - Upsert setting:
    - `INSERT INTO system_settings (name, value, note) VALUES ('LEAVE_REASONS_REQUIRE_HR_APPROVAL', '["annual"]', 'Leave reasons requiring HR approval when duration > 1 day') ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note;`
  - Add another reason:
    - `UPDATE system_settings SET value = '["annual","special_emergency"]' WHERE name = 'LEAVE_REASONS_REQUIRE_HR_APPROVAL';`
  - Remove all reasons (manager-only for all):
    - `UPDATE system_settings SET value = '[]' WHERE name = 'LEAVE_REASONS_REQUIRE_HR_APPROVAL';`
- If full monorepo lint fails due to unrelated workspace issues, validate at least:
  - `pnpm --filter @repo/database type-check`
  - `pnpm --filter web type-check`
### Annual Leave Ledger Models

- `EmployeeAnnualLeaveBalance`
  - unique by `(employeeId, year)`
  - `entitledDays`, `adjustedDays`, `consumedDays`
- `EmployeeLeaveLedgerEntry`
  - immutable ledger rows (`entitlement|adjustment|deduction|reversal`)
  - optional `leaveRequestId` linkage for audit traceability
