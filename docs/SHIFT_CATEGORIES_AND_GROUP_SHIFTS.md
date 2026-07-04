# Shift Categories and Group Shifts

## Overview

The system supports four kinds of guard shifts: **onsite** (guard stays at a single fixed site), **office_control** (guard in a control room at head office), **event_temporary** (guard at a temporary event location), and **escort** (guard escorts a client from a start site to an end site). `office_control` and `event_temporary` behave identically to `onsite` in the backend but render distinct labels in the admin UI and mobile app. Escort shifts can optionally be grouped into a **Group Shift** — an entity that links all individual guard shifts sharing the same origin, destination, and date, and optionally owns a Group Chat for real-time coordination.

---

## 1. Shift Kinds

### `onsite`, `office_control`, `event_temporary`
- Guard is stationed at a single `fixed`-kind site for the shift duration.
- Only one location (`siteId`) is involved.
- The workflow: record attendance → periodic check-ins → auto-complete (or manual completion).
- Periodic check-ins at `requiredCheckinIntervalMins` intervals with `graceMinutes` tolerance.
- For `office_control` and `event_temporary`, `requiredCheckinIntervalMins` is locked to the full shift duration (one check-in for the entire shift).
- Worker monitors for missed check-ins and generates alerts.

### `escort`
- Guard escorts a client from a `fixed`-kind start site (`siteId`) to an `escort`-kind end site (`escortEndSiteId`).
- Two locations are involved: start (fixed) and end (escort).
- The workflow: record attendance → depart start location → arrive at end location → end duty.
- Periodic check-ins are **replaced** by explicit duty action buttons (depart, arrive, end).
- Duty actions on the mobile app: Start Duty, Send Location, Send Photo, Leaving Location, Arrived Location, End Duty.
- Only `scheduled` status is editable through the standard shift edit form — group-bound fields (site, date, shift type) are locked once created.

---

## 2. Shift Data Model

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `siteId` | FK → Site | Start site (must be `kind='fixed'`) |
| `shiftTypeId` | FK → ShiftType | Defines start/end time template |
| `employeeId` | FK → Employee (nullable) | Assigned guard |
| `kind` | `onsite \| office_control \| event_temporary \| escort` | Shift category |
| `escortEndSiteId` | FK → Site (nullable) | End site for escort (must be `kind='escort'`) |
| `date` | Date | Calendar date |
| `startsAt` | DateTime | Precise start datetime (derived from shift type + date) |
| `endsAt` | DateTime | Precise end datetime |
| `status` | `scheduled \| in_progress \| completed \| missed \| cancelled` | Lifecycle |
| `requiredCheckinIntervalMins` | Int | Interval between periodic check-ins (default 20) |
| `graceMinutes` | Int | Grace period for check-in windows (default 2) |
| `departedAt` | Timestamptz (nullable) | When guard departed start location (escort only) |
| `arrivedAt` | Timestamptz (nullable) | When guard arrived at end location (escort only) |
| `groupShiftId` | FK → GroupShift (nullable) | Links to the group this shift belongs to |
| `missedCount` | Int | Counter for missed check-in windows |
| `attendance` | Attendance (1:1) | One-time start-of-shift record |
| `checkins[]` | Checkin[] | Periodic heartbeats |
| `alerts[]` | Alert[] | Missed check-in/attendance alerts |

### Status lifecycle

```
scheduled → in_progress → completed
                ↓             ↓
             missed        cancelled
```

- `scheduled`: Shift created, awaiting guard action.
- `in_progress`: Guard recorded attendance (`POST .../attendance`).
- `completed`: All duties finished (last check-in for onsite; End Duty action for escort).
- `missed`: Guard never attended or the shift was abandoned.
- `cancelled`: Admin cancelled the shift.

---

## 3. Group Shift

### Purpose

A Group Shift represents a single escort duty event on a given `(siteId, endSiteId, date)`. It:
- Groups N individual `Shift` rows (one per guard) under one logical batch.
- Optionally owns a `GroupChat` for real-time coordination.
- Stores batch-level metadata: `clientName` and `note`.
- Provides a direct FK link between shifts and their group chat (replacing string-based `sourceRef`).

### Data Model (`GroupShift`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `siteId` | FK → Site | Start site (must be `kind='fixed'`) |
| `endSiteId` | FK → Site | End site (must be `kind='escort'`) |
| `shiftTypeId` | FK → ShiftType | Shared shift type template |
| `date` | Date | Calendar date |
| `kind` | `escort` | Currently always `escort` |
| `clientName` | String? | Client name for the escort job |
| `note` | Text? | Free-text note |
| `shifts[]` | Shift[] (1:N) | All individual guard shifts in the group |
| `groupChat` | GroupChat? (1:1) | Auto-created chat for the group |

### Uniqueness

```
@@unique([siteId, endSiteId, date])
```

Only one Group Shift per origin/destination/date combination. Multiple guards on the same route on the same date share one Group Shift.

### Repository functions (`packages/database/src/repositories/group-shifts.ts`)

| Function | Purpose |
|----------|---------|
| `upsertGroupShift` | Create or retrieve existing group by (siteId, endSiteId, date). Updates `clientName` if changed. |
| `getGroupShiftById` | Fetch group with child shifts and optional group chat. |
| `getGroupShiftByKeys` | Fetch group by (siteId, endSiteId, date) with group chat. |
| `getPaginatedGroupShifts` | Paginated list with date range, site, endSite filters + child shift aggregates. |
| `getGroupShiftDetail` | Full detail with child shifts (employee, attendance) + group chat. |
| `updateGroupShift` | Update safe metadata only: `clientName`, `note`. No cascade to child shifts. |

---

## 4. Onsite vs Escort — Key Differences

| Aspect | Onsite / Office Control / Event Temporary | Escort |
|--------|--------|--------|
| Locations | 1 fixed site | 1 fixed start + 1 escort end |
| Check-ins | Periodic (`requiredCheckinIntervalMins`) for `onsite`; locked to full shift duration for `office_control` / `event_temporary` | **Replaced** by duty actions |
| Completion | Auto on last check-in | Explicit **End Duty** action |
| Group Shift | Not applicable | Required (every escort shift belongs to one) |
| Group Chat | Not applicable | Optional (auto-created via schedule builder) |
| Mobile duty buttons | Start Duty only | Start Duty, Leave, Arrive, End, Send Location, Send Photo |
| Departure/Arrival tracking | Not applicable | `departedAt`, `arrivedAt` timestamps |
| Individual shift edit | Full editing freedom | Group fields locked (site, date, shift type) — only employee and note can be changed |

---

## 5. Group Shift Lifecycle

### Creation (via schedule builder — `bulkCreateShiftsFromFormAction`)

```
for each unique date:
  1. upsertGroupShift(siteId, endSiteId, shiftTypeId, date, clientName)
  2. bulkCreateShiftsFromForm({ ..., groupShiftIds: { dateStr: groupShift.id } })
     → each shift created with groupShift FK
  3. if autoCreateChatRoom:
       createGroupChat({ ..., groupShiftId: groupShift.id })
       → group chat linked to Group Shift via FK
```

### Single shift creation (`createShift`)

```
if kind === 'escort' and escortEndSiteId:
  groupShift = upsertGroupShift({ siteId, endSiteId, shiftTypeId, date })
  createShiftWithChangelog({ ..., groupShift: { connect: { id: groupShift.id } } })
  if groupChat exists for this groupShift:
    add the new guard as a member
```

### Shift deletion (`deleteShift`)

```
if shift has groupShiftId:
  findGroupChatByGroupShiftId(groupShiftId)
  remove guard from group chat (if present)
deleteShiftWithChangelog(id)
```

### Shift cancellation (`cancelShift`)

Same as deletion — removes guard from group chat, then cancels.

### Adding a guard to an existing group (`addGuardToGroupAction`)

```
1. Find the Group Shift
2. Create a new Shift with the same site, endSite, shiftType, date, startsAt, endsAt, kind
3. Link to the Group Shift via groupShiftId
4. If a Group Chat exists for this Group Shift, add the guard as a member
```

### Removing a guard (`removeGuardFromGroupAction`)

```
1. Verify shift is 'scheduled' (only scheduled shifts can be removed)
2. Remove guard from Group Chat (if exists)
3. deleteShiftWithChangelog(id)
```

---

## 6. Admin UI

### List tab (`/admin/guard-shifts/group-shifts`)

Table with filters (date range, start site, end site) showing:

| Column | Source |
|--------|--------|
| Client Name | `groupShift.clientName` |
| Site → End Site | `groupShift.site.name → groupShift.endSite.name` |
| Date | `groupShift.date` |
| Shift Type | `groupShift.shiftType.name` |
| Guards | Count + status aggregate ("2 scheduled, 1 in progress") |
| Chat | Link icon if group chat exists |
| Actions | View button → detail page |

### Detail page (`/admin/guard-shifts/group-shifts/[id]`)

Sections:
1. **Header**: `Escort: Site → EndSite — dd MMM yyyy`
2. **Metadata**: Editable `clientName` and `note`
3. **Group Chat**: Link to open chat (or "No group chat created")
4. **Child Shifts**: Table with guard name, status badge, time range, attendance, edit/remove actions
5. **Add Guard**: Dropdown + button to add a new guard to the group

### Individual shift editing (`/admin/guard-shifts/[id]/edit`)

When a shift belongs to a Group Shift (`groupShiftId != null`):
- An info banner displays: "This shift belongs to a group. Site, date, shift type, and timing are managed at the group level."
- Locked fields (read-only text): kind, site, escort end site, shift type, date, interval, grace minutes
- Editable fields (status permitting): employee reassignment, note

---

## 7. Mobile Duty Actions (Escort)

When the active shift's `kind === 'escort'`, the home screen replaces `CheckInCard` with `EscortDutyCard`:

| Button | Condition | API Endpoint |
|--------|-----------|-------------|
| Start Duty | Always enabled (existing `AttendanceRecord`) | `POST .../attendance` |
| Leave Location | Enabled when `status === 'in_progress'` and `departedAt === null` | `POST .../shifts/[id]/depart` |
| Arrived Location | Enabled when `departedAt !== null` and `arrivedAt === null` | `POST .../shifts/[id]/arrive` |
| End Duty | Enabled when `status === 'in_progress'` | `POST .../shifts/[id]/complete` |

In the group chat screen, a quick-action bar provides one-tap buttons:

| Button | Action |
|--------|--------|
| Send Location | Gets current location and emits as a chat message via socket |
| Send Photo | Opens camera, uploads to S3, and emits as a chat message via socket |

---

## 8. Group Chat Integration

- One `GroupChat` per Group Shift (optional, created when `autoCreateChatRoom` is checked in the schedule builder).
- All participating guards + all active admins are added as participants.
- Lead guard gets `role: 'lead'`.
- Chat visibility is deferred: `visibleFromAt = startsAt - 30 min` — the chat appears in the inbox only 30 minutes before the shift starts.
- Late-added guards also get deferred visibility via the same mechanism.
- When a guard is removed from the shift, they are also removed from the group chat.
- The chat auto-archives 2 days after the shift date (via daily worker cron `archiveExpiredGroupChats`).
