# Ticket System — Current State

Current as of code inspection on 2026-06-16.

Covers the admin ticket system across:
- `apps/web/app/admin/(authenticated)/ticket/` — all route and component files
- `packages/database/prisma/schema.prisma` — Ticket model and related models
- `packages/database/src/repositories/tickets.ts` — data access layer
- `apps/web/app/admin/(authenticated)/ticket/actions.ts` — server actions

## Route Structure

| Path | Description |
|---|---|
| `/admin/ticket/dashboard` | Overview dashboard (metrics, filterable table, sidebar) |
| `/admin/ticket/[view]` | Workspace (list + detail). `view` ∈ `all`, `acknowledged`, `unassigned`, `closed` |
| `/admin/ticket/create` | Create ticket form |
| `/admin/ticket/dashboard?sla=breached` | Overview dashboard pre-filtered to breached SLA tickets |

The legacy `[tab]/dashboard/page.tsx` now redirects `tab=ticket` to `/admin/ticket/dashboard`.

## Data Model

### Ticket

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `code` | String | Auto-generated, unique, sequential (e.g. `TCK-0001`) |
| `title` | String | Auto-generated from first line of description (80 char max) |
| `description` | Text | Rich HTML (TinyMCE) |
| `resolutionTargetHours` | Int | SLA target in hours (1, 2, 4, 8, 12, 24, 48, 72) |
| `priority` | `LOW \| MEDIUM \| HIGH` | Default `MEDIUM` |
| `status` | See below | Default `NEW` |
| `submitterAdminId` | String | FK to Admin who created the ticket |
| `claimedByType` | `ADMIN \| EMPLOYEE`? | Null if unclaimed |
| `claimedByAdminId` | String? | FK |
| `claimedByEmployeeId` | String? | FK |
| `claimedAt` | DateTime? | |
| `departmentRoleId` | String? | FK to Role. Links to a role whose `policy.ticketDepartment` matches the selected department |
| `clientName` | String | |
| `clientContact` | String | |
| `clientLocation` | String | |
| `solvedAt` | DateTime? | Set when status moves to `SOLVED` |
| `closedAt` | DateTime? | Set when status moves to `CLOSED` |
| `cannotResolveAt` | DateTime? | Set when status moves to `CANNOT_RESOLVE` |
| `cancelledAt` | DateTime? | Set when status moves to `CANCELLED` |
| `cancellationNote` | Text? | Required when cancelling |

### Status (enum)

```
NEW -> ACKNOWLEDGED -> WAITING_INFORMATION -> IN_PROGRESS -> SOLVED -> CLOSED
                                                           -> CANNOT_RESOLVE
                                           -> CANCELLED (at any point)
```

Full set: `NEW`, `ACKNOWLEDGED`, `WAITING_INFORMATION`, `IN_PROGRESS`, `SOLVED`, `CLOSED`, `CANNOT_RESOLVE`, `CANCELLED`.

### Priority (enum)

`LOW`, `MEDIUM`, `HIGH`

### TicketAssignedRole

Maps roles to tickets for notification routing. Each ticket can have multiple assigned roles.

### TicketAssignedEmployee

Maps employees to tickets. Employees receive push notifications on ticket creation.

### TicketMessage

| Field | Type |
|---|---|
| `id` | UUID |
| `ticketId` | FK |
| `adminId` | String? (null if sent by employee) |
| `employeeId` | String? (null if sent by admin) |
| `body` | Text |
| `createdAt` | DateTime |

Messages can have `attachments` (TicketAttachment with `messageId` set).

### TicketAttachment

| Field | Type |
|---|---|
| `id` | UUID |
| `ticketId` | FK |
| `messageId` | String? (null for ticket-level attachments) |
| `uploadedByAdminId` | String? |
| `uploadedByEmployeeId` | String? |
| `fileName` | String |
| `fileSize` | Int |
| `mimeType` | String |
| `s3Key` | String |
| `s3Bucket` | String |
| `publicUrl` | String? (null, enriched server-side via presigned URL) |
| `createdAt` | DateTime |

### TicketHistory

| Field | Type |
|---|---|
| `id` | UUID |
| `ticketId` | FK |
| `actorAdminId` | String? |
| `actorEmployeeId` | String? |
| `action` | `CREATED \| STATUS_CHANGED \| PRIORITY_CHANGED \| ASSIGNMENT_CHANGED \| MESSAGE_ADDED \| ATTACHMENT_ADDED \| REOPENED` |
| `fromValue` | String? |
| `toValue` | String? |
| `metadata` | Json? |
| `createdAt` | DateTime |

### TicketCodeSequence

Single-row table (`id = "global"`) with incrementing `value` for sequential ticket code generation.

### SLA Notes

`CANCELLED` tickets are treated as SLA `pending` (not counted as met or breached).

---

## Overview Dashboard (`/admin/ticket/dashboard`)

**Server component:** `ticket/dashboard/page.tsx`

Wraps four async container components in `<Suspense>` boundaries, each rendered inside `<TicketOverviewDashboard>` (client component that listens for real-time ticket events to trigger `router.refresh()`).

### DashboardMetricsContainer

Fetches and renders 5 metric cards via `<TicketOverviewMetrics>`:

| Metric | Source |
|---|---|
| Total Tickets | `db.ticket.count()` |
| Open Tickets | Count where status in `[NEW, ACKNOWLEDGED, WAITING_INFORMATION]` |
| In Progress | Count where status = `IN_PROGRESS` |
| Resolved Today | Count where `solvedAt >= today` OR `closedAt >= today` |
| SLA Breach | From `getTicketDashboardSidebarStats()` → `slaStatus.breached` |

Each metric shows a delta hint compared to yesterday (from `getTicketDashboardComparisonStats`).

### DashboardFiltersContainer

Renders `<TicketOverviewFilters>` — client component (`useSearchParams`/`useRouter`) with:

- **Search input** — debounced (500ms), query param `q`
- **Category** dropdown — from `TICKET_DEPARTMENT_OPTIONS`
- **Status** dropdown — all 8 statuses
- **Priority** dropdown — LOW / MEDIUM / HIGH
- **SLA Status** dropdown — `met`, `pending`, `breached`
- **Assigned To** dropdown — all admins/employees with claimed tickets, plus `Unassigned`

### DashboardTableContainer

Renders `<TicketOverviewTable>` — server-side filtered table with columns:

Ticket ID, Subject, Category, Site/Client, Priority, Status, Assigned To, Created, SLA Due, Actions.

- Fetches up to 8 rows per query
- Supports filtering by `q`, `department`, `status`, `priority`, `assignee`, `sla`
- SLA filter is applied in-memory (uses `getTicketSlaStatus()`)
- Each row has a dropdown action linking to `/admin/ticket/all?ticket={id}`

### DashboardSidebarContainer

Renders `<TicketOverviewSidebarPanel>` from `getTicketDashboardSidebarStats(adminId)`:

- **Ticket Shortcuts**: Create New Ticket, Acknowledged, Unassigned Tickets, SLA Breached, Today's Resolved (with badge counts)
- **Tickets By Category**: Donut chart + legend from department role policies
- **SLA Status**: Donut chart (met/pending/breached) with counts

### SLA Calculation

`getTicketSlaStatus(ticket, now)`:

- Active statuses (`NEW`, `ACKNOWLEDGED`, `WAITING_INFORMATION`, `IN_PROGRESS`): `breached` if `createdAt + resolutionTargetHours < now`, else `pending`
- Terminal statuses (`SOLVED`, `CLOSED`, `CANNOT_RESOLVE`): `met` if completed before deadline, else `breached`
- `CANCELLED`: always `pending` (ignored for met/breached)

---

## Workspace (`/admin/ticket/[view]`)

**Route handler:** `ticket/[view]/page.tsx`

Accepts `view` ∈ `all | acknowledged | unassigned | closed`. Passes validated params to `renderTicketWorkspacePage(view, searchParams)` from `ticket-workspace-page.tsx`.

### Server-side data loading

```
all          → listTickets(params)
acknowledged → listAcknowledgedTickets(adminId, params)
unassigned   → listUnassignedTickets(params)
closed       → listClosedTickets(params)
```

Supported `searchParams` for list:
- `q` — search term (sent to server)
- `statuses` — comma-separated `TicketStatus[]`
- `priorities` — comma-separated `TicketPriority[]`
- `assignedRoleIds` — comma-separated role IDs
- `ticket` — preselect a specific ticket ID

Server prefetches `getTicketDetailAction(targetTicketId)` for the preselected or first ticket, serializes everything, and passes to `<TicketWorkspaceView>`.

### TicketWorkspaceView (client component)

**File:** `ticket/components/ticket-workspace-view.tsx`

Owns state for:
- `selectedId` — currently selected ticket ID
- `detail` — fetched via `useQuery(['ticket', selectedId], getTicketDetailAction)`
- `searchTerm` — client-side list filter
- `message`, `selectedFiles`, `isSendingMessage` — compose area
- `isClaiming` — claim button loading state
- `activeTab` — `details | discussion | attachments | history` (default: `discussion`)

Uses `@tanstack/react-query` for detail fetching with server-hydrated `initialData`.

Syncs `selectedId` to URL query param `?ticket={id}` via `router.replace`.

**Real-time via WebSocket:**
- Subscribes to `subscribe_ticket` / `unsubscribe_ticket` rooms based on `selectedId`
- Listens for `ticket_created` → refresh workspace
- Listens for `ticket_status_updated` → refresh detail + workspace
- Listens for `ticket_message_added` → refresh detail

#### Layout

Two-column grid: `col-span-4` list panel + `col-span-8` detail card (if a ticket is selected).

### TicketListPanel

**File:** `ticket/components/ticket-list-panel.tsx`

Left panel with:
- **Title** header (varies by view: "All Tickets", "Acknowledged" for `acknowledged` view, "Unassigned Tickets", "Closed Tickets")
- **Search** input — filters items client-side by title, code, client name
- **Priority filter** dialog — checkbox selection for LOW/MEDIUM/HIGH
- **Sort toggle** — newest first (default) or oldest first
- **Scrollable list** — each item shows code, title, client name, priority badge, status badge, timestamp

### TicketDetailHeader

**File:** `ticket/components/ticket-detail-header.tsx`

Top section of the detail panel showing:
- **Header row**: Claim button, More menu (status actions), Close button
- **Title row**: `{code}` + priority badge + status badge + SLA due date (countdown)
- **Metadata grid**: Created By, Created Date, Client Name, Client Location, Department, Assigned To, Client Contact, Status

**Claim button behavior:**
- Only visible if user's role matches `ticket.departmentRoleId` (`hasClaimRole`) or user already claimed it
- `canClaim` is true when ticket is not already claimed by current user
- Calls `claimTicketAction(ticketId)`

**More menu (status actions):**
- Submitter: `CLOSED`, `CANCELLED` only
- Claimant: `WAITING_INFORMATION`, `IN_PROGRESS`, `SOLVED`, `CANNOT_RESOLVE`, `CANCELLED`
- Cancel triggers a dialog requiring a cancellation note
- For closed/cancelled tickets, a "Reopen Ticket" button appears if `ACKNOWLEDGED` is allowed

**Tab bar:** Details | Discussion | Attachments ({count}) | History

### TicketTabContent

**File:** `ticket/components/ticket-tab-content.tsx`

#### Details tab
Renders `ticket.description` via `<RichTextViewer>` (HTML).

#### Discussion tab
Message thread with:
- Each message shows: avatar initials, author name, timestamp, body text
- Attachments inline: image previews, video players, file download links
- Message input at bottom with:
  - File attach button (accepts image/*, video/*, application/pdf)
  - File chips showing selected files with remove
  - Text input with Enter-to-send
  - Send button
- Composer is hidden when ticket is `CLOSED` or `CANCELLED` with a disabled notice

#### Attachments tab
Grid of all ticket-level (non-message) attachments with file name, size, download link.

#### History tab
Chronological list of `TicketHistory` entries showing actor, action, from→to values.

---

## Create Ticket (`/admin/ticket/create`)

**Server component:** `ticket/create/page.tsx`

Checks `PERMISSIONS.TICKETS.CREATE`, renders `<TicketCreateForm adminName={...}>`.

### TicketCreateForm (client component)

**File:** `ticket/components/ticket-create-form.tsx`

Form sections:

| Section | Fields |
|---|---|
| Create Ticket | Created By (read-only), Department (from `TICKET_DEPARTMENT_OPTIONS`), Priority, Promised Resolution Time (SLA hours), Date |
| Client Information | Client Name, Client Contact (phone input), Client Location (Google Places autocomplete + map preview) |
| Problem Information | Problem description (TinyMCE rich editor), Attachments (drag/drop with preview modal) |

**Submission flow:**
1. Validates description (non-empty), client contact (≥7 digits)
2. Auto-generates title from first line of description (80 chars max)
3. Calls `createTicketAction` with form data
4. Uploads attachments via `createTicketAttachmentUploadUrlAction` + `uploadFileWithPresignedPost`
5. Calls `attachUploadedFilesToTicketAction` to attach uploaded files
6. Redirects to `/admin/ticket/all?ticket={newTicketId}`

Uses Google Maps API (`@vis.gl/react-google-maps`) for location autocomplete and map preview.

---

## Server Actions

All in `ticket/actions.ts`:

| Action | Permission | Description |
|---|---|---|
| `createTicketAction` | `TICKETS.CREATE` | Creates ticket, assigns department role, sends push notifications to assigned employees, revalidates paths |
| `listTicketsAction` | `TICKETS.VIEW` | Paginated ticket list |
| `listAcknowledgedTicketsAction` | `TICKETS.VIEW` | Tickets claimed by current admin with status ACKNOWLEDGED |
| `listUnassignedTicketsAction` | `TICKETS.VIEW` | Unclaimed tickets |
| `listClosedTicketsAction` | `TICKETS.VIEW` | Closed/cancelled tickets |
| `getTicketSidebarCountsAction` | `TICKETS.VIEW` | Counts for the workspace list views |
| `getTicketDetailAction` | `TICKETS.VIEW` | Full ticket detail + history, enriched attachment URLs, permission flags (canClaim, isSubmitter, isClaimant, allowedStatusActions, etc.) |
| `claimTicketAction` | `TICKETS.VIEW` | Claims a ticket by admin (checks role match) |
| `addTicketMessageAction` | `TICKETS.VIEW` | Adds plain text message, notifies assigned roles |
| `addTicketMessageWithAttachmentsAction` | `TICKETS.VIEW` | Adds message with pre-uploaded file metadata, validates key prefix |
| `updateTicketStatusAction` | `TICKETS.VIEW` | Changes status with role-based permission check, notifies submitter on change |
| `updateTicketPriorityAction` | `TICKETS.EDIT` | Changes priority |
| `updateTicketAssignedRolesAction` | `TICKETS.EDIT` | Updates role assignments, notifies newly assigned roles |
| `createTicketAttachmentUploadUrlAction` | `TICKETS.VIEW` | Returns presigned POST policy for S3 upload |
| `attachUploadedFilesToTicketAction` | `TICKETS.VIEW` | Attaches uploaded files to ticket (validates key prefix) |

### Claim flow

`claimTicketAction` → `claimTicket()` in repository:
- Validates admin's role matches `ticket.departmentRoleId` (unless super admin)
- Sets `claimedByType = 'ADMIN'`, `claimedByAdminId = adminId`, `claimedAt = now()`
- Creates history entry `ASSIGNMENT_CHANGED`

### Status permission logic

Defined in actions.ts:
```ts
const SUBMITTER_STATUS_ACTIONS = ['CLOSED', 'CANCELLED'];
const CLAIMANT_STATUS_ACTIONS = ['WAITING_INFORMATION', 'IN_PROGRESS', 'SOLVED', 'CANNOT_RESOLVE', 'CANCELLED'];
```

- `isSubmitter`: ticket creator
- `isClaimant`: admin who claimed the ticket (claimedByType === 'ADMIN' && claimedByAdminId === session.id)
- Submitter can only close or cancel their own submitted tickets
- Claimant can progress the ticket through the workflow
- Others (neither submitter nor claimant) have no status actions at all

### Attachment upload key prefix

The server validates that uploaded S3 keys start with:
```
tickets/env={NODE_ENV}/ticket_{ticketId}/
```
(Not using session-based temp prefixes as in earlier iterations.)

---

## Notifications Pipeline

### Admin notifications

Written to `AdminNotification` table then published to Redis:
```
admin-notifications:admin:{adminId}
```

Notification triggers:
1. **Message added** — `notifyAssignedRoles()` notifies admins whose role is assigned to the ticket (excluding the actor)
2. **Roles assigned** — `notifyAssignedRoles()` with type `ticket_assigned_role`
3. **Status changed** — `notifySubmitterOnStatusChange()` notifies the original submitter when someone else changes the status

### Employee push notifications

On ticket creation, `sendTicketCreatedPushNotification()` sends FCM push to each assigned employee. Failures are logged but non-blocking.

---

## Realtime via WebSocket

The `SocketProvider` context provides socket connectivity.

**TicketOverviewDashboard** (overview page): listens for `ticket_created`, `ticket_status_updated`, `ticket_message_added` → calls `router.refresh()`.

**TicketWorkspaceView** (workspace page):
- Subscribes to `subscribe_ticket:{ticketId}` room on mount / when `selectedId` changes
- Unsubscribes on unmount / when `selectedId` changes
- `ticket_created` → `refreshWorkspace()`
- `ticket_status_updated` → refresh detail if matches `selectedId`, then refresh workspace
- `ticket_message_added` → refresh detail if matches `selectedId`

---

## File Attachments

### Client-side validation
- Allowed types: images, videos, PDF
- Max size: 10 MB per file

### Upload flow
1. Client requests presigned POST policy via `createTicketAttachmentUploadUrlAction(ticketId, fileName, contentType, fileSize)`
2. Client uploads file directly to S3 using `uploadFileWithPresignedPost()`
3. Client submits uploaded file metadata (fileName, fileSize, mimeType, s3Key, s3Bucket) to `addTicketMessageWithAttachmentsAction` or `attachUploadedFilesToTicketAction`
4. Server validates key prefix and persists attachment record

### URL enrichment
On detail load, `getTicketDetailAction` enriches attachments missing `publicUrl` by calling `getCachedPresignedDownloadUrl(s3Key)`, which generates a presigned CloudFront/S3 download URL.

---

## Revalidation

`revalidateTicketPaths(ticketId?)` in actions.ts calls `revalidatePath()` for:
- `/admin/ticket/dashboard`
- `/admin/ticket/all`
- `/admin/ticket/acknowledged`
- `/admin/ticket/unassigned`
- `/admin/ticket/closed`
- `/admin/ticket/create`
- `/admin/ticket/${ticketId}` (if ticketId provided)

---

## Important Notes

- The workspace list search is **both server-side** (sent as `q` param to `listTickets` on initial load) and **client-side** (filters `initialItems` by title/code/clientName)
- `useTransition()` is used only for `router.refresh()` calls, not for detail fetching (which uses React Query)
- `initialView` and `initialHasMore` are passed from server but `initialHasMore` is not currently used client-side
- `requestedTicketId` is respected on initial mount and synced bidirectionally with URL
- The overview dashboard table shows max 8 rows with pagination placeholder (pagination buttons are present but disabled in current implementation)
- Department roles are configured via Admin roles with `policy.ticketDepartment` set to one of `TICKET_DEPARTMENT_OPTIONS`
- Each department can have exactly one role; creating a ticket validates this constraint
- `CANCELLED` tickets are treated as SLA `pending` (ignored for met/breached counts)

## Files Involved

```
apps/web/app/admin/(authenticated)/ticket/
├── actions.ts
├── [view]/page.tsx
├── create/page.tsx
├── dashboard/page.tsx
└── components/
    ├── ticket-workspace-page.tsx
    ├── ticket-workspace-view.tsx
    ├── ticket-dashboard-types.ts
    ├── ticket-dashboard-utils.ts
    ├── ticket-list-panel.tsx
    ├── ticket-detail-header.tsx
    ├── ticket-tab-content.tsx
    ├── ticket-create-form.tsx
    ├── ticket-overview-dashboard.tsx
    ├── ticket-overview-dashboard.types.ts
    ├── ticket-overview-dashboard.utils.ts
    ├── ticket-overview-dashboard-filters.tsx
    ├── ticket-overview-dashboard-table.tsx
    ├── ticket-overview-dashboard-sidebar.tsx
    ├── ticket-overview-dashboard-metrics.tsx
    ├── dashboard-containers.tsx
    └── dashboard-skeletons.tsx
```
