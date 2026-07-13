# Calendar Feature

## Overview

The calendar feature provides a unified scheduling view across shifts, holidays, memos, leave requests, and user-created events. It serves both **employees** (React Native mobile) and **admins** (Next.js web) with a shared data model.

**Key design constraint**: zero new native dependencies on mobile — all views use existing deps (gluestack-ui, date-fns, reanimated, flash-list). Ships entirely as JS via EAS Update.

---

## Data Model

### CalendarEvent (`calendar_events`)

The core model with polymorphic ownership (either `employeeId` or `adminId`, never both, never neither).

```
model CalendarEvent {
  id                    String            @id @default(uuid())
  employeeId            String?           @map("employee_id")
  adminId               String?           @map("admin_id")
  kind                  CalendarEventKind @default(personal_event)
  title                 String
  description           String?           @db.Text
  startDate             DateTime          @map("start_date") @db.Date
  endDate               DateTime          @map("end_date") @db.Date
  startTime             String?           @map("start_time")
  endTime               String?           @map("end_time")
  allDay                Boolean           @default(false) @map("all_day")
  location              String?
  latitude              Float?
  longitude             Float?
  clientName            String?           @map("client_name")
  trainerName           String?           @map("trainer_name")
  priority              String?           @default("normal")
  color                 String?
  reminderMinutesBefore Int?              @map("reminder_minutes_before")
  reminderScheduledAt   DateTime?         @map("reminder_scheduled_at") @db.Timestamptz(6)
  reminderSentAt        DateTime?         @map("reminder_sent_at") @db.Timestamptz(6)
  deletedAt             DateTime?         @map("deleted_at")
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")

  employee Employee?          @relation(fields: [employeeId], references: [id], onDelete: SetNull)
  admin    Admin?             @relation(fields: [adminId], references: [id], onDelete: SetNull)
  tags     CalendarEventTag[]

  @@index([employeeId, startDate])
  @@index([employeeId, endDate])
  @@index([adminId, startDate])
  @@index([adminId, endDate])
  @@index([deletedAt])
  @@index([deletedAt, startDate, endDate])
  @@index([reminderScheduledAt, reminderSentAt])
  @@map("calendar_events")
}

enum CalendarEventKind {
  meeting
  client_meeting
  reminder
  task
  deadline
  follow_up
  training
  personal_event
  other
}
```

**Field notes**:
- `startDate`/`endDate` are `@db.Date` (date-only). `startTime`/`endTime` are nullable `String` ("HH:mm").
- `priority` is a free string: `urgent`, `high`, `normal`, `low`. Default `normal`.
- `reminderMinutesBefore` + pre-computed `reminderScheduledAt` UTC timestamp + `reminderSentAt` idempotency flag form the reminder pipeline.
- `latitude`/`longitude` enable map preview on both mobile and web.
- Soft delete via `deletedAt` (matches existing codebase pattern).

### CalendarEventTag (`calendar_event_tags`)

Polymorphic join table linking events to tagged employees and admins.

```
model CalendarEventTag {
  id              String             @id @default(uuid())
  eventId         String             @map("event_id")
  participantType TagParticipantType @map("participant_type")
  employeeId      String?            @map("employee_id")
  adminId         String?            @map("admin_id")
  createdAt       DateTime           @default(now()) @map("created_at")

  event    CalendarEvent @relation(fields: [eventId], references: [id], onDelete: Cascade)
  employee Employee?     @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  admin    Admin?        @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@unique([eventId, employeeId])
  @@unique([eventId, adminId])
  @@index([eventId])
  @@index([employeeId])
  @@index([adminId])
  @@index([participantType, employeeId])
  @@map("calendar_event_tags")
}

enum TagParticipantType {
  employee
  admin
}
```

---

## Shared Packages

### Types (`@repo/types`)

| Export | Description |
|---|---|
| `CalendarItemKind` | Union: `holiday \| office_memo \| leave \| meeting \| client_meeting \| reminder \| task \| deadline \| follow_up \| training \| personal_event \| other` |
| `CalendarItem` | Unified shape returned by aggregation API: `id, originalId, kind, title, date, startsAt, endsAt, allDay, priority, location, latitude, longitude, status, colorHint` |
| `CalendarDetailKind` | Alias for `CalendarItemKind` |
| `CalendarDetailResponse` | `{ item: { kind, data } }` |
| `CalendarEventKind` | Union of the 9 user-created event kinds (excludes system kinds) |
| `TaggedUser` | `{ id, type: employee\|admin, name, email? }` |
| `CreateCalendarEventInput` | Full create input including `taggedEmployeeIds`, `taggedAdminIds`, `reminderMinutesBefore` |
| `UpdateCalendarEventInput` | Partial update variant |
| `CalendarEventItem` | Full event output: fields + `taggedUsers[]`, `ownerId`, `ownerType`, `ownerName` |

### Validation (`@repo/validations`)

**File**: `packages/validations/src/index.ts` (lines 686-848)

| Schema | Description |
|---|---|
| `calendarListSchema` | `{ from: isoDate, to: isoDate }` — refined to max 367-day range |
| `calendarEventKindSchema` | Zod enum of 9 event kinds |
| `createCalendarEventSchema` | Full create with `superRefine`: endDate >= startDate, allDay/time conflict, startTime < endTime, no duplicate tagged user IDs |
| `updateCalendarEventSchema` | Partial variant with same cross-field refinement |

### Calendar Metadata (`@repo/shared`)

**File**: `packages/shared/src/calendar-meta.ts`

Central source of truth for kind metadata consumed by both mobile and web:

| Export | Description |
|---|---|
| `ALL_CALENDAR_EVENT_KINDS` | Const array of 9 kinds (NOT including holiday/office_memo/leave) |
| `KINDS_WITH_END_DATE` | `Set<CalendarEventKind>` — kinds that show an end date field |
| `KINDS_WITH_TIME` | `Set` — kinds that show time fields |
| `KINDS_WITH_LOCATION` | `Set` — kinds that show location |
| `KINDS_WITH_PRIORITY` | `Set` — kinds that show priority (all except reminder) |
| `KIND_COLORS` | `Record<string, string>` — default hex colors for all 12 kinds (system + user) |
| `KIND_LABELS` | `Record<string, string>` — display labels for all kinds |
| `REMINDER_PRESETS` | `{ labelKey, minutes }[]` — 7 presets: at event, 10m, 30m, 1h, 1d, 3d, 1w |
| `computeReminderScheduledAt(startDate, startTime, offsetMinutes)` | Computes UTC Date for worker scheduling. Timezone: Asia/Makassar UTC+8 |

**File**: `packages/shared/src/calendar-serialize.ts`

`serializeCalendarEvent()` — normalizes Prisma event fields to serializable output (dates to ISO strings, null defaults).

---

## Backend API

### Base URL: `/api/`

### Employee Calendar Endpoints

All require `getAuthenticatedEmployee()`.

| Method | Path | Description |
|---|---|---|
| GET | `/employee/my/calendar?from=&to=` | Aggregated calendar — fetches holidays, memos, leaves, and user events (own + tagged) within date range. Expands multi-day items into per-day entries. Returns `{ items: CalendarItem[] }` sorted by date. |
| GET | `/employee/my/calendar/events?from=&to=` | Lists only user-created `CalendarEvent` items for the employee (own + tagged includes owner info). |
| POST | `/employee/my/calendar/events` | Create event. Body validated with `createCalendarEventSchema`. Creates event + tags in `$transaction`. Calls `notifyCalendarEventTags` for new tags. Publishes Redis `calendar:event_created`. |
| PUT | `/employee/my/calendar/events/[id]` | Update event. Ownership check (`employeeId` match). Tags diffed — only newly tagged users notified. Resets `reminderSentAt` on scheduling changes. Publishes `calendar:event_updated`. |
| DELETE | `/employee/my/calendar/events/[id]` | Soft-delete (set `deletedAt`). Ownership check. Publishes `calendar:event_deleted`. |
| POST | `/employee/my/calendar/events/[id]/duplicate` | Clone event. Ownership check. **Does not copy tags**. Publishes `calendar:event_created`. |
| GET | `/employee/my/calendar/items/[type]/[id]` | Detail for any calendar item type (holiday, memo, leave, or custom event). Scope-checked for holidays/memos. |
| GET | `/employee/my/users/search?q=` | Search employees + admins for tagging. Uses DB-level `ILIKE` search (`searchEmployeesByName`, `searchAdminsByName`). |

### Admin Calendar Endpoints

All require admin authentication (handled by `proxy.ts`). CRUD operations are available to all authenticated admins — edit/delete gated by ownership.

| Method | Path | Description |
|---|---|---|
| GET | `/admin/calendar?from=&to=&employeeId=&kind=&priority=&clientName=&taggedUserId=` | Master aggregation — holidays, memos, employee events (super admin only), and admin events. **Visibility scoped by role** (see matrix below). Response includes `ownerId`, `ownerType`, `ownerName`. |
| GET | `/admin/calendar/events?from=&to=` | Lists admin events. **Super admin**: all admin events. **Non-super admin**: own + tagged events. |
| POST | `/admin/calendar/events` | Create event (admin-owned). Same flow as employee create. |
| GET | `/admin/calendar/events/[id]` | Detail. **Super admin**: any admin event. **Non-super admin**: strict ownership (`adminId` match), 404 otherwise. |
| PUT | `/admin/calendar/events/[id]` | Update. Ownership check (`adminId` match). Tags diffed + notified. Publishes Redis event. |
| DELETE | `/admin/calendar/events/[id]` | Soft-delete. Ownership check. Publishes Redis event. |
| POST | `/admin/calendar/events/[id]/duplicate` | Duplicate admin event. **Does not copy tags**. Publishes Redis event. |
| GET | `/admin/calendar/items/[type]/[id]` | Detail for any item type. **Super admin**: any event. **Non-super admin**: own events, tagged events, or employee events. 403 for untagged other-admin events. |

#### Visibility Matrix (`GET /admin/calendar`)

| Data | Super Admin | Non-Super Admin |
|---|---|---|
| Holidays | All | All |
| Office memos | All | All |
| Employee events | All (with optional `employeeId` filter) | **None** (hidden) |
| Admin events | All (all admins) | Own + tagged only |

#### `isOwner` field behavior

The response `isOwner` field reflects actual ownership (`event.adminId === session.id`). **Super admin** viewing another admin's event receives `isOwner: false` — the UI hides edit/delete buttons for non-owners (super admin mutation is API-only).

**Query filter params** on `GET /admin/calendar`:
- `employeeId` — filter by one employee
- `kind` — comma-separated kind values
- `priority` — comma-separated priority values
- `search` — title/description ILIKE search (via `listCalendarEvents` repository)
- `clientName` — client name ILIKE filter
- `taggedUserId` — filter by tagged participant

### Aggregation Strategy

Multi-day items (holidays, memos, leaves, events spanning multiple days) produce **one `CalendarItem` per day** using `expandToDays()` (`eachDayOfInterval`). This enables dot rendering on the month grid without client-side date math.

Item ID format: `{kind}:{originalId}:{YYYY-MM-DD}` (composite for per-day deduplication).

---

## Repositories (`packages/database/src/repositories/`)

### `calendar-events.ts`

| Function | Description |
|---|---|
| `createCalendarEvent(input, tx?)` | Inserts event + tags. Computes `reminderScheduledAt` if `reminderMinutesBefore` set. |
| `updateCalendarEvent(id, input, tx?)` | Partial update. Re-syncs tags (deleteAll + createMany). Resets `reminderSentAt` + recomputes `reminderScheduledAt` on scheduling changes. |
| `deleteCalendarEvent(id, tx?)` | Soft delete. |
| `getCalendarEventById(id, tx?)` | Includes `employee { fullName }` and `admin { name }`. |
| `listCalendarEvents(params)` | Complex filtered query: date range, owner (employee/admin/ids), kinds, search (ILIKE title+description), priority[], clientName, taggedUserId, includeAllAdminEvents. Optional tag + owner includes. |
| `listEmployeeCalendarEvents(employeeId, from, to, tx?)` | Own + tagged events for an employee. |
| `listCalendarDaySummary(params)` | `groupBy startDate` returning `{date, count}[]. Supports includeAllAdminEvents flag. |
| `getCalendarEventTagsRaw(eventId, tx?)` | Raw tag rows with employee/admin includes. |
| `getCalendarEventReminderCandidates(now)` | Events with `reminderScheduledAt <= now`, `reminderSentAt IS NULL`, `reminderMinutesBefore IS NOT NULL`, `deletedAt IS NULL`. |
| `claimCalendarEventReminders(eventIds, now)` | `updateMany WHERE id IN (...) AND reminderSentAt IS NULL` — claim-based idempotency. |

### `calendar-event-tags.ts`

| Function | Description |
|---|---|
| `syncCalendarEventTags(eventId, taggedEmployeeIds, taggedAdminIds, tx?)` | Delete all + `createMany`. |
| `getCalendarEventTags(eventId, tx?)` | Returns `TaggedUserResult[]`. |
| `findTaggedEventIds(employeeId, fromDate, toDate, tx?)` | Returns event IDs where employee is tagged. |
| `getTagsForEvents(eventIds, tx?)` | Batch fetch — returns `Record<eventId, TaggedUserResult[]>`. Solves N+1 tag query. |

---

## Notifications

### FCM Push

Two dedicated functions in `packages/notifications/src/fcm.ts`:

1. **`sendCalendarEventTagPushNotification`** — `type: 'calendar_event_tagged'`, Android channel `calendar_events_v1`, deep link `targetPath: '/calendar/events/{eventId}/detail'`.
2. **`sendCalendarEventReminderPushNotification`** — `type: 'calendar_event_reminder'`, same channel and structure.

### Admin In-App Notifications

The `notifyCalendarEventTags` helper in `apps/web/lib/calendar-notifications.ts`:
- Sends FCM push to each tagged employee
- Persists `admin_notifications` rows for tagged admins (`type: 'calendar_event_tagged'`)
- Publishes `calendar:event_tagged` Redis event for each tagged user

### Notification Flow on Create/Update

1. Event saved in `$transaction`
2. `notifyCalendarEventTags()` called after transaction commits
3. Redis `events:calendar` published separately (for socket fan-out)

---

## Background Worker

**File**: `apps/worker/src/processors/calendar-event-reminder.processor.ts`

**Queue**: `calendar-event-reminder` (registered in `packages/database/src/queues.ts`)
**Job**: `send-calendar-event-reminder`
**Interval**: 60 seconds (configured in `apps/worker/src/worker.ts`)

**Flow**:
1. `getCalendarEventReminderCandidates(now)` — finds all due unsent reminders
2. `claimCalendarEventReminders(eventIds, now)` — claims via atomic `updateMany` (only first tick wins)
3. For each claimed event:
   - Employee owner → FCM push
   - Admin owner → `createAdminNotifications` with type `calendar_event_reminder`
   - Tagged employees → FCM push with "(you are tagged)"
   - Tagged admins → `createAdminNotifications`
4. Publishes `calendar:event_reminder_sent` Redis event

---

## Real-Time Updates

Redis pub/sub channel: `events:calendar`

Published event types:
- `calendar:event_created` — on create/duplicate
- `calendar:event_updated` — on update
- `calendar:event_deleted` — on delete
- `calendar:event_tagged` — per tagged user (employee ID or admin ID in payload)
- `calendar:event_reminder_sent` — from worker

Socket.io handler in `packages/realtime/src/handlers/system.ts` listens on `events:calendar` and forwards to connected clients. Admin web subscribes via `socket.on('calendar_changed')` and invalidates query cache.

---

## Audit Trail

Calendar event mutations (CREATE, UPDATE, DELETE) are recorded in the existing `Changelog` table via `WithChangelog` repository functions (`calendar-events.ts:658-811`).

**Captured data:**
- **CREATE**: `action: 'CREATE'`, `details: { kind, title, startDate, endDate, allDay, priority, taggedUserIds }`
- **UPDATE**: `action: 'UPDATE'`, `details: { changedFields[], diff: { [field]: { from, to } }, tagDiff: { addedEmployees?, removedEmployees?, addedAdmins?, removedAdmins? } }` — empty diffs are skipped.
- **DELETE**: `action: 'DELETE'`, `details: { title, kind, startDate, endDate }`

**Actor tracking:**
- Admin mutations: `actor: 'admin'`, `actorId` set to admin ID (Admin relation, existing pattern).
- Employee mutations: `actor: 'employee'`, `employeeId` set to employee ID (Employee relation, added to schema).
- Worker reminders are **not** logged (internal flag flip only).

**Query API (admin only):**
- `GET /api/admin/calendar/events/[id]/changelogs?limit=50&cursor=<id>` — paginated, ordered by `createdAt DESC`.
- Response: `{ items: CalendarEventChangelogItem[], nextCursor: string | null }`.

**Repository:**
- `createCalendarEventWithChangelog(input, actor, tx?)` — wraps create + changelog.
- `updateCalendarEventWithChangelog(id, input, actor, tx?)` — wraps update + diff + changelog.
- `deleteCalendarEventWithChangelog(id, actor, tx?)` — wraps soft delete + changelog.
- `listCalendarEventChangelogs(eventId, params?, tx?)` — paginated query with admin/employee includes.

All 8 mutation call sites (admin API routes, employee API routes, admin server actions) are wired to the `WithChangelog` variants. Internal calls (e.g., duplicate) are now wrapped in `$transaction` for atomicity.

---

## Mobile App (React Native)

### File Structure

```
apps/mobile/
  app/calendar/
    index.tsx              ← Main calendar screen (view switcher + grid)
    create.tsx             ← Create event screen
    [type]/[id].tsx        ← Event detail screen
    events/[id]/edit.tsx   ← Edit event screen
  src/
    hooks/useCalendar.ts   ← 6 TanStack Query hooks
    components/calendar/
      CalendarEventForm.tsx    ← Shared create/edit form component
      CalendarMonthView.tsx    ← Month grid (7-column, dots, today highlight)
      CalendarWeekView.tsx     ← Week time grid (vertical hour columns)
      CalendarDayView.tsx      ← Day time grid
      CalendarListView.tsx     ← FlashList grouped by date
      CalendarViewSwitcher.tsx ← Month|Week|Day|List segmented control
      CalendarEventCard.tsx    ← Event card (icon, color dot, time, title)
      UserTagPicker.tsx        ← Search + chip picker for tagging
```

### Navigation

Calendar is a sub-screen (not a tab), accessed from the Account screen. Expo Router auto-registers stack screens above tabs.

### Views

| View | Component | Description |
|---|---|---|
| Month | `CalendarMonthView` | 7-column week grid, event dots, today ring, swipeable |
| Week | `CalendarWeekView` | Horizontal hour columns, event cards at time offset, snap scroll |
| Day | `CalendarDayView` | Single-day vertical ScrollView with hour slots, all-day banner |
| List | `CalendarListView` | FlashList grouped by date headers, pull-to-refresh |

### Hooks (`useCalendar.ts`)

| Hook | Query key | Stale time |
|---|---|---|
| `useCalendarEvents(from, to)` | `['calendar', from, to]` | 60s |
| `useCalendarItem(type, id)` | `['calendar', 'item', type, id]` | 60s |
| `useCreateCalendarEvent()` | Invalidates `['calendar']` | — |
| `useUpdateCalendarEvent()` | Invalidates `['calendar']` | — |
| `useDeleteCalendarEvent()` | Invalidates `['calendar']` | — |
| `useDuplicateCalendarEvent()` | Invalidates `['calendar']` | — |
| `useUserSearch(query)` | `['users', 'search', query]` | 30s |

### Event Form (`CalendarEventForm.tsx`)

Shared between create and edit. Uses central kind metadata from `@repo/shared` for field visibility rules. Features:
- Horizontal scrollable kind selector (chips with emoji icons)
- Date/time pickers via `@react-native-community/datetimepicker`
- All-day toggle (hides time fields when on)
- Conditional fields: end date, time, location, client name, trainer name, priority
- Reminder picker (Actionsheet with 7 presets + custom)
- Color picker (8 preset circles)
- User tag picker (search + removable chips)
- Client-side Zod validation before submission
- Glassmorphism cards (BlurView + dark background)

---

## Admin Web UI (Next.js)

### File Structure

```
apps/web/app/admin/(authenticated)/calendar/
  page.tsx                             ← Server component, permission guard
  CalendarView.tsx                     ← Client component: view state, queries, filters
  actions.ts                           ← Server actions (create/update/delete/duplicate)
  types.ts                             ← Local CalendarItem interface
  components/
    MonthGrid.tsx                      ← FullCalendar dayGridMonth wrapper
    TimeGridView.tsx                   ← FullCalendar timeGridWeek/timeGridDay
    EventCard.tsx                      ← Event chip (color dot, time, location, owner)
    EventDetailPanel.tsx               ← Side panel: full detail, edit/delete, tagged users, map
    EventForm.tsx                      ← Modal form for create/edit
    FilterBar.tsx                      ← Search, kind, priority, employee filters
    ViewToggle.tsx                     ← Month/Week/Day toggle with nav
```

### Calendar Library

Uses **FullCalendar** (`@fullcalendar/react`, `@fullcalendar/daygrid`, `@fullcalendar/timegrid`).

- Month view: `dayGridMonth` with custom day cell content showing dot markers from day-summary API
- Week view: `timeGridWeek`
- Day view: `timeGridDay`

Navigation uses `calendar.getApi().gotoDate()` on a ref, not `initialDate` prop (avoids remount).

### Event Form (`EventForm.tsx`)

Modal dialog with:
- Kind selector (chips), title, all-day toggle
- Date inputs (`<input type="date">`), time inputs (`<input type="time">`)
- Reminder select (7 presets + custom number input)
- Location with address autocomplete (`AddressAutocompleteInput`) + map preview (`AddressMapPreview`)
- Client name (shown for client_meeting/follow_up)
- Trainer name (shown for training)
- Priority select
- Color picker (8 preset circles)
- Tag users (via separate search — however tagging UI is not integrated in admin EventForm)
- Description textarea
- Client-side Zod validation with per-field error display
- Focus trap and Escape-to-close

### Permissions

No specific calendar permission required — all authenticated admins have full CRUD access. Edit/delete is gated by event ownership (only the owner can modify or remove their events).

Admin sidebar group: "Personal Management".

### Event Detail Panel (`EventDetailPanel.tsx`)

Side panel (384px) showing:
- Kind label, title, date/time
- Location with map preview (if coordinates present)
- Owner name + type badge (Employee/Admin)
- Priority badge (non-normal only)
- Tagged users list (employee/admin tags with color-coded badges)
- Edit/Delete buttons (gated by ownership + permission)
- Two-step delete confirmation

---

## i18n

**Files**: `packages/shared/src/locales/en.json` and `id.json` (76 calendar keys each)

Key groups:
- View labels: `title`, `monthView`, `weekView`, `dayView`, `listView`, `today`, `tomorrow`, `yesterday`
- Day headers: `sun`–`sat`
- System kinds: `shift`, `holiday`, `leave`, `memo`, `officeShift`, `schedule`
- Event kinds: `kindMeeting`–`kindOther`
- Priorities: `priorityUrgent`–`priorityLow`
- Form: `newEvent`, `editEvent`, `deleteEvent`, `duplicate`, `createEvent`, `saveChanges`
- Fields: `startDate`, `endDate`, `startTime`, `endTime`, `allDay`, `location`, `description`, `notes`, `color`, `clientName`, `trainerName`
- Tags: `tagUsers`, `searchUsers`, `noUsersFound`, `taggedUsers`, `adminTag`, `employeeTag`, `eventTaggedTitle`, `eventTaggedBody`
- Reminders: `reminder`, `reminderNone`, `reminderAtEvent`, `reminder10Min`, `reminder30Min`, `reminder1Hour`, `reminder1Day`, `reminder3Days`, `reminder1Week`, `reminderMinutesBefore`, `reminderHoursBefore`, `reminderDaysBefore`, `reminderCustom`

---

## Key Design Decisions

| Decision | Choice |
|---|---|
| Event ownership | Polymorphic: `employeeId?` or `adminId?` (exactly one set) |
| Tagged user permissions | View-only — only the owner can edit/delete |
| Multi-day items | Expanded to per-day entries server-side (simplifies client rendering) |
| Reminder scheduling | Pre-computed UTC timestamp (avoids timezone math on every worker tick) |
| Reminder delivery | Claim-based idempotency (`updateMany WHERE reminderSentAt IS NULL`) |
| Admin master view | Lazy by date — day-summary for dots, full items on click |
| Admin visibility scoping | Super admin sees all; non-super admin sees own + tagged admin events, no employee events |
| Calendar library (web) | FullCalendar |
| Calendar library (mobile) | Pure gluestack + date-fns (no native deps) |
| Soft delete | `deletedAt` pattern (matches Shift, OfficeMemo) |
| Real-time | Redis pub/sub → Socket.io fan-out |
| Form validation | Zod schemas validated both client and server side |
| Kind metadata | Centralized in `@repo/shared/calendar-meta.ts` |
