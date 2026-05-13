# Backup/Standby Role Model and Temporary Office Assignment Plan

## Context and Problem

The current employee model is centered on two roles:

- `on_site`: used for guard-shift operations and periodic site check-ins
- `office`: used for office attendance flows

Recent business clarification introduced two guard types:

- **Standby**: true onsite guard profile, should follow onsite behavior
- **Backup**: office-first profile, stationed at office, but can temporarily cover site duty when standby is unavailable (for example, standby on leave)

At the same time, employees can temporarily switch office/station, while current data model only supports one `employee.officeId`.

## Current System Behavior (Grounded in Code)

### Role-driven behavior

- Office attendance context is gated by `employee.role === 'office'`.
- Guard-shift assignment pools and import currently filter by `role: 'on_site'`.
- Periodic check-in enforcement is tied to assigned guard shifts (`requiredCheckinIntervalMins`, `graceMinutes`, slot windows), not to office attendance.
- Existing logic deletes future guard shifts when role changes from `on_site` to `office` (`ROLE_CHANGE_TO_OFFICE` path).

### External sync behavior (recently adjusted)

- Sync role mapping now derives role from department:
  - normalized department `security standby` => `on_site`
  - otherwise => `office`
- `roleSyncOverride` prevents sync from automatically changing a manually overridden role.

### Office assignment limitation

- `employee.officeId` is a single value.
- Attendance/geofence/visibility/ownership flows depend on that single office link.
- Temporary station transfers require manual flips and are error-prone.

## Core Decision

Do not “hack” onsite behavior with extreme grace settings (for example `graceMinutes = 8 hours`) to emulate office behavior.

Instead:

1. Keep **identity role** and **duty mode** conceptually separate.
2. Keep backup as office-first identity, but allow explicit temporary site-duty assignment.
3. Add time-bounded office assignment model so temporary office/station transfers are first-class and auditable.

## Target Model

### 1) Identity and duty

- `employee.role` remains identity-level (`office` / `on_site`).
- Standby remains `on_site` by default.
- Backup remains `office` by default.
- Site-duty behavior for backup is activated by assignment capability, not by forcing global role flips.

### 2) Backup eligibility capability

Add employee capability to distinguish office employees who may cover onsite duty:

- Option A (minimal): `employee.isBackupEligible: boolean` (recommended)
- Option B (more explicit taxonomy): `employee.employmentType: 'standby' | 'backup' | 'office'`

Recommended for near-term delivery: **Option A** for lowest blast radius.

### 3) Time-bounded office assignments

Introduce a historical assignment table:

- `employee_office_assignments`
  - `id`
  - `employee_id`
  - `office_id`
  - `effective_from` (timestamp/date)
  - `effective_until` (nullable)
  - `source` (`sync` | `manual`)
  - `note` (nullable)
  - audit fields (`created_at`, `updated_at`, optional actor fields if needed)

`employee.officeId` remains as compatibility/default pointer during migration window.

## Detailed Implementation Plan

### Phase 1: Data model foundation

1. Add `isBackupEligible` column on `employees` (default `false`, non-null).
2. Add `employee_office_assignments` table with indexes:
   - `(employee_id, effective_from DESC)`
   - `(employee_id, effective_until)`
   - `(office_id, effective_from DESC)`
3. Add uniqueness/overlap guard at application layer first:
   - reject overlapping assignment windows per employee.
4. Keep existing `employee.officeId` intact for compatibility.

### Phase 2: Resolver layer (single source of truth)

Add repository helpers:

- `resolveEffectiveOfficeAssignment(employeeId, at)`
- `resolveEffectiveOfficeId(employeeId, at)`
- precedence:
  1. active time-bounded assignment at `at`
  2. fallback to `employee.officeId`

Use this resolver in:

- office attendance context
- office attendance API routes (`today`, `weekly`, record endpoint)
- admin visibility/ownership checks that currently directly compare `employee.officeId`
- any geofence logic that validates office location

### Phase 3: Backup coverage without role flip

Update guard-shift assignment candidate logic:

- include `on_site` employees
- plus `office` employees with `isBackupEligible = true`

Apply same criteria to:

- guard shift create/edit picker
- guard shift CSV/bulk import employee resolution

Behavior:

- when backup is assigned guard shift, standard onsite periodic check-in rules apply for that shift
- when not assigned guard shift, backup remains in office attendance flow

### Phase 4: External sync integration

1. Keep existing role mapping logic as-is for standby detection.
2. Do not auto-manage `isBackupEligible` unless external system has reliable source field.
3. Sync office updates should write:
   - `employee.officeId` default/current value
   - and optionally append/update `employee_office_assignments` entries only if upstream provides effective dates (otherwise skip to avoid wrong history).

### Phase 5: Admin operations UX

1. Employee edit page:
   - show `isBackupEligible` toggle
   - keep role override controls
2. Add lightweight “Temporary Office Assignment” management:
   - create assignment window
   - end active assignment
   - list recent assignment history
3. Add validation:
   - no overlapping windows
   - `effective_until > effective_from`

### Phase 6: Cleanup and hardening

After resolver adoption is complete and stable:

1. audit direct `employee.officeId` reads in critical flows
2. migrate to resolver-backed reads where needed
3. optionally deprecate direct reliance on `employee.officeId` for runtime decisions

## Public Interfaces / Contracts to Update

- Employee DTOs and validation:
  - add `isBackupEligible`
- Admin employee update action/schema:
  - accept and persist `isBackupEligible`
- New office assignment API/actions:
  - create/update/end assignment windows
- Guard shift candidate endpoints/services:
  - include backup-eligible office employees

## Data Migration and Backfill Strategy

1. Schema migration:
   - add `isBackupEligible` and new assignment table.
2. Initial backfill:
   - create one open-ended assignment per office employee with current `employee.officeId` where present.
3. Safety:
   - run backfill idempotently
   - log employees skipped due to missing office
4. Rollout:
   - ship schema + resolver first
   - flip consumers incrementally

## Test Plan

### Unit tests

1. Effective office resolver:
   - active window hit
   - fallback to `employee.officeId`
   - overlapping-window rejection
2. Guard shift candidate filtering:
   - includes `on_site`
   - includes `office + isBackupEligible`
   - excludes `office + !isBackupEligible`
3. Sync interaction:
   - role mapping unchanged for standby logic
   - `roleSyncOverride` still blocks role auto-update

### Integration tests

1. Backup employee (office role, backup eligible):
   - can be assigned guard shift
   - periodic check-in enforcement works
2. Same backup employee with no guard shift:
   - office attendance still available/required
3. Temporary office assignment:
   - office attendance/geofence uses effective assigned office at time `T`
   - ownership/visibility aligns with effective office

### Regression tests

1. Standby (`on_site`) scheduling/check-in unchanged
2. Office-only employees unchanged
3. Leave-request role-dependent paths unchanged

## Risks and Mitigations

### Risk 1: Role and duty semantics drift
- Mitigation: document clear definitions and keep role immutable for identity-level behavior.

### Risk 2: Office resolver not applied everywhere
- Mitigation: central resolver + search/audit pass for direct `employee.officeId` usage; track migration checklist.

### Risk 3: Operational confusion during transition
- Mitigation: explicit admin UI labels:
  - “Role (identity)”
  - “Backup Eligible (site coverage capability)”
  - “Temporary Office Assignment”

## Rollout Plan

1. Deploy schema migration.
2. Deploy resolver utilities and non-invasive read-path integration.
3. Backfill initial office assignments.
4. Enable backup eligibility in admin UI.
5. Update guard-shift candidate/filter logic.
6. Monitor logs and operational metrics for one payroll/attendance cycle.

## Success Criteria

1. Backup employees can cover site duty without changing identity role.
2. Backup employees still follow office attendance when not covering site duty.
3. Temporary office/station transfers no longer require risky manual office flips.
4. Attendance, geofence, and ownership decisions reflect effective office by date/time.
5. No regression in standby onsite operations.

