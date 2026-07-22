# Shift Swap & Replace

## Overview

Admins can reassign a guard on an existing shift in two ways from the guard-shifts admin page:

- **Replace (Replace Guard Modal)** — swap the guard *in place* on a single shift. The shift keeps its id, status, attendance, check-ins, and group-chat linkage. A new guard takes over the same shift.
- **Swap (Swap Shift Modal)** — exchange the guards between **two** shifts. Each guard takes over the other's shift; both shifts keep their own ids but get new `employeeId`s.

Both operations are atomic (Prisma transaction with row locks) and each writes an `UPDATE` changelog entry tagged with `details.method` of `REPLACEMENT` or `SWAP`. They also fire Redis events and push notifications, and reconcile approved on-site leave coverage for the affected employees/dates.

Relevant UI: `apps/web/app/admin/(authenticated)/guard-shifts/components/replace-guard-modal.tsx`, `swap-shift-modal.tsx`, and server actions in `apps/web/app/admin/(authenticated)/guard-shifts/actions.ts`. Core logic lives in `packages/database/src/repositories/shifts.ts` (`replaceShiftGuard`, `swapShifts`).

---

## 1. Replace Guard (In-Place)

### When to use
A single shift needs a different guard — e.g. a guard calls in sick and you assign a replacement to the *same* shift slot. The shift identity does not change.

### Inputs (validated by `replaceShiftSchema`)
| Field | Type | Rules |
|-------|------|-------|
| `shiftId` | UUID | Required. Must exist, not soft-deleted (`deletedAt`). |
| `replacementEmployeeId` | UUID | Required. Must exist, `role='on_site'`, `status=true` (active), and **different** from the current guard. |
| `reason` | enum | Required: `'Sick' \| 'Personal Reason' \| 'Family Emergency' \| 'Other'`. |
| `notes` | string? | Optional, max 2000 chars. |
| `evidenceS3Key` | string? | Optional, max 500 chars. S3 key for uploaded proof (image/PDF). |

### Eligibility
- Shift status must be `scheduled` or `in_progress`. Forbidden: `cancelled`, `completed`, `missed`.
- The replacement guard must have no overlapping (non-cancelled) shift during the target shift's time window.
- Both the original and replacement employee rows are row-locked (`SELECT ... FOR UPDATE`) to serialize concurrent edits.

### What happens (`replaceShiftGuard`)
1. Validates status, replacement guard role/status, and overlap.
2. Updates the shift **in place**:
   - `employeeId` → replacement guard
   - `note` → prepends `[Replaced on <ISO timestamp>]: <reason>` (+ optional notes + `Evidence: <key>`)
   - Sets `replacedByAdminId`, `replacedAt`, `replacementReason`, `evidenceS3Key`
3. Writes one `UPDATE` changelog with `details.method='REPLACEMENT'`, including `previousEmployeeId/Name/Number`, `replacementReason`, `replacementNotes`, `evidenceS3Key`, `replacedAt`, and a `changes` diff (`employeeId`, `employeeName`, `note`).
4. Post-commit: publishes `SHIFT_REPLACED` on `events:shifts`; pushes a Redis stream event `shift_updated` to the new guard; reconciles approved on-site leave coverage for the affected date.
5. `replaceShift` action additionally: sends push notifications to **both** the original guard (now removed) and the new guard, and creates an HR notification (`createShiftReassignmentHrNotification`, type `replace`).

### Notes
- Attendance, check-ins, alerts, and `groupShiftId` are preserved — the replacement guard inherits the existing shift fully.
- This is distinct from an overtime/extra shift; it is a reassignment of an existing slot.

---

## 2. Swap Shifts (Two Guards, Two Shifts)

### When to use
Two guards want to trade shifts — Guard A takes Guard B's shift and vice versa. Both shifts already exist and are assigned.

### Eligibility
- Both shifts must exist, not soft-deleted, and have an assigned `employeeId`.
- Both must be `scheduled` or `in_progress`. Forbidden: `cancelled`, `completed`, `missed`.
- The two guards must be **different** (cannot swap a shift with itself).
- Overlap check: after the swap, neither guard may collide with one of their *other* (non-swapped) shifts.
- Both shift rows are row-locked, then both affected employee rows are row-locked (`SELECT ... FOR UPDATE`), in deterministic sorted order.

### What happens (`swapShifts`)
1. Locks both shift rows; loads both with relations (site, shiftType, employee, groupShift).
2. Validates status, assignment, distinct guards, and overlap.
3. Updates both shifts: each `employeeId` is set to the *other* shift's guard. Sets `swapsWithShift` to the partner shift, prepends `[Swap on <ISO timestamp>]: <reason>` (+ notes) to each `note`.
4. **Group chat detachment:** if either shift belonged to a `groupShift`, it is disconnected (`groupShift: disconnect`). Cross-group or same-group in-place swaps are not supported because attendance can desync — the group id is recorded in the changelog as `groupDetached`.
5. Writes **two** `UPDATE` changelogs (`details.method='SWAP'`), each with `swapPairShiftId`, `swapsWithShiftId`, `swapReason`, `groupDetached`, and a `changes` diff (`employeeId`, `note`).
6. Post-commit: publishes `SHIFT_SWAPPED` (with both ids) on `events:shifts`; pushes `shift_updated` Redis events to both guards; reconciles leave coverage for both guards on both dates.
7. `swapShiftsAction` additionally: sends push notifications to both guards (each notified once) and creates an HR notification (type `swap`).

### Candidate selection in the UI (`swap-shift-modal.tsx`)
- Guard B is chosen from employees excluding Guard A.
- Guard B's eligible shifts are fetched on demand via `getSwapCandidateShiftsAction` → `getShiftsByEmployeeWithinWindow`, which returns **today or future** (`date >= today UTC midnight`) non-deleted shifts.
- Only shifts with `status` `scheduled` or `in_progress` and a non-past date are selectable. If exactly one matches, it auto-selects.
- Prevents selecting Guard B with no eligible shift (`canSave` requires at least one candidate).

---

## 3. Comparison

| Aspect | Replace | Swap |
|--------|---------|------|
| Shifts involved | 1 (modified in place) | 2 (exchanged) |
| Shift id preserved | Yes (same row) | Yes (both rows keep their ids) |
| `employeeId` change | Original → replacement | A's guard → B's guard, and vice versa |
| Changelog entries | 1 (`REPLACEMENT`) | 2 (`SWAP`) |
| `swapsWithShift` | Not set | Set on both shifts |
| Group chat handling | Preserved (inherits) | Detached from group shift |
| Reason required | Yes (enum, no default) | No (defaults to `Personal Reason`) |
| Evidence upload | Yes (optional S3 file) | No |
| Overlap check | Replacement guard vs their shifts | Each guard vs their *other* shifts |
| Notifications | Original + new guard + HR | Both guards + HR |

---

## 4. Status & Forbidden States

Both operations reject shifts in these states:
- `cancelled`
- `completed`
- `missed`

Only `scheduled` or `in_progress` shifts can be replaced or swapped.

---

## 5. Audit Trail

Every replace/swap writes to the `changelog` table:
- `entityType: 'Shift'`, `action: 'UPDATE'`, `actor: 'admin'`, `actorId: <adminId>`.
- `details.method` is `'REPLACEMENT'` or `'SWAP'`.
- `details.changes` captures the field diff (minimally `employeeId`/`employeeName`/`note`).
- Derived fields always present: `kind`, `siteName`, `typeName`, `employeeName`, `date`, `startsAt`, `endsAt`, `status`, `note`, `siteId`, `shiftTypeId`, `employeeNumber`.

The `getLatestSwapReplacementChangelogByShiftIds` repository function reads these changelogs (most recent per shift) to surface the last swap/replacement in list/export views, exposing `method`, `previousEmployeeName`, optional `swapPartnerName`, and `replacementReason`.

---

## 6. Side Effects (both operations)

After the DB transaction commits:
- Redis `PUBLISH events:shifts` with the relevant event type (`SHIFT_REPLACED` / `SHIFT_SWAPPED`).
- Redis `XADD employee:stream:<employeeId>` (`shift_updated`) for each affected guard.
- `reconcileApprovedOnsiteLeavesForCoverage` for affected employee(s) over the affected date(s) — keeps on-site leave coverage consistent after reassignment.
- Push notifications to affected guards + an HR admin notification about the reassignment.

These post-commit steps are intentionally outside the transaction so a notification failure does not roll back the reassignment.

---

## 7. Implementation Map (where to make changes)

### Repositories — `packages/database/src/repositories/shifts.ts`
| Function | Responsibility |
|----------|----------------|
| `replaceShiftGuard({ shiftId, replacementEmployeeId, reason, notes?, evidenceS3Key? }, adminId)` | In-place guard replacement. Validates status/role/overlap, row-locks employees, updates shift + writes `REPLACEMENT` changelog. Returns updated shift. |
| `swapShifts({ shiftAId, shiftBId, reason, notes? }, adminId)` | Two-shift exchange. Locks shift + employee rows, detaches group chats, writes two `SWAP` changelogs. Returns `{ shiftA, shiftB }`. |
| `getShiftsByEmployeeWithinWindow(employeeId, referenceDate, include?)` | Candidate source for the swap modal. Returns non-deleted shifts with `date >= today UTC midnight` (today/future only). |
| `getLatestSwapReplacementChangelogByShiftIds(shiftIds)` | Reads most-recent `UPDATE` changelog per shift, filters to `method` `SWAP`/`REPLACEMENT`. Feeds list/export views (`LatestSwapReplacement` type). |
| `reconcileApprovedOnsiteLeavesForCoverage({ employeeId, startDateKey, endDateKey, adminId })` | Called post-commit for affected employee(s)/date(s). |

### Server actions — `apps/web/app/admin/(authenticated)/guard-shifts/actions.ts`
| Function | Responsibility |
|----------|----------------|
| `replaceShift(input)` | Auth + `replaceShiftSchema` validation, calls `replaceShiftGuard`, sends push notifications to original + new guard, creates HR notification (type `replace`), `revalidatePath`. |
| `swapShiftsAction(input)` | Auth + `swapShiftsSchema` validation, calls `swapShifts`, sends push notifications to both guards (deduped), creates HR notification (type `swap`), `revalidatePath`. |
| `getSwapCandidateShiftsAction({ employeeId, referenceDate })` | Thin wrapper over `getShiftsByEmployeeWithinWindow`; serializes rows to `SerializedShiftWithRelationsDto[]` for the modal. |

### Validation schemas — `packages/validations/src/index.ts`
- `replaceShiftSchema` — `shiftId`, `replacementEmployeeId`, `reason` (enum, required), `notes?`, `evidenceS3Key?`.
- `swapShiftsSchema` — `shiftAId`, `shiftBId`, `reason?`, `notes?`, with `.refine` rejecting `shiftAId === shiftBId`.

### UI components — `apps/web/app/admin/(authenticated)/guard-shifts/components/`
- `replace-guard-modal.tsx` — Replace form: original guard (read-only), replacement guard select, reason select, notes, optional S3 file upload (`uploadToS3` → `shift-replacements` folder). Submits via `onSubmit` → `replaceShift`.
- `swap-shift-modal.tsx` — Swap form: Guard A (read-only), Guard B select (excludes Guard A), Guard B shift select (fetched on demand from `getSwapCandidateShiftsAction`, filtered to `scheduled`/`in_progress` + non-past). Auto-selects when exactly one candidate exists.

### Notifications — `packages/notifications`
- `sendShiftReassignmentPushNotification({ employeeId, shiftId, siteName, shiftTypeName, date, startsAt, endsAt, reason, kind: 'replace' | 'swap', wasOriginalAssignee })`
- `createShiftReassignmentHrNotification({ type, shiftIds, employeeNames, adminId, reason })`

### Redis / realtime
- Publish channel: `events:shifts` with payloads `SHIFT_REPLACED` / `SHIFT_SWAPPED`.
- Per-employee stream: `employee:stream:<employeeId>` `XADD` with `type='shift_updated'`. Consumed by the realtime/Socket.io layer to push live updates to the mobile app.

### Key invariants to preserve when editing
- Replace must keep the shift row intact (attendance, check-ins, alerts, `groupShiftId`). Only `employeeId`, `note`, and replacement-metadata columns change.
- Swap must detach `groupShift` (set `groupDetached` in changelog) — in-place group swaps are unsupported.
- Both operations must remain inside a single Prisma transaction with `FOR UPDATE` row locks, and keep notification/reconciliation work **outside** the transaction.
- Changelog `details.method` must be exactly `'REPLACEMENT'` or `'SWAP'` — `getLatestSwapReplacementChangelogByShiftIds` and the export logic depend on it.
