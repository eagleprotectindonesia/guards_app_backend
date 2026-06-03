# Ticket Dashboard Current State

Current as of code inspection on 2026-05-28.

This document covers the current product flow and technical implementation for the admin ticket dashboard in:

- `apps/web/app/admin/(authenticated)/[tab]/dashboard/page.tsx`
- `apps/web/app/admin/(authenticated)/ticket/components/ticket-dashboard-view.tsx`
- `apps/web/app/admin/(authenticated)/ticket/actions.ts`
- Supporting components under `apps/web/app/admin/(authenticated)/ticket/components/`

## Product Flow

### 1. Entry point

The ticket dashboard is rendered when an admin visits the tabbed admin dashboard with `tab=ticket`.

The route wrapper reads query parameters and builds the initial ticket list based on:

- `view`: `all` | `my` | `unassigned` | `closed`
- `ticket`: optional ticket ID to preselect
- `q`: search term
- `statuses`: comma-separated status filters
- `priorities`: comma-separated priority filters
- `assignedRoleIds`: comma-separated role filters

The first rendered state is server-side data for the selected view, then the client dashboard takes over.

### 2. List + detail layout

The dashboard uses a two-column layout:

- Left column: searchable list of tickets
- Right column: selected ticket detail panel

If there is no selected ticket, the detail panel shows an empty-state prompt asking the admin to select a ticket.

### 3. Ticket selection

The selected ticket is initialized in this order:

- `requestedTicketId` from the URL
- otherwise the first item in the initial list
- otherwise `null`

Selecting a ticket loads its full detail view and history.

### 4. Detail tabs

The ticket detail area has four tabs:

- `Details`
- `Discussion`
- `Attachments`
- `History`

The default tab is `Discussion`.

#### Details

Shows the ticket description.

#### Discussion

Shows the message thread for the ticket and allows admins to:

- type a reply
- attach image, video, or PDF files
- send the message

#### Attachments

Shows all ticket-level attachments with download links and media previews where possible.

#### History

Shows the ticket audit trail and state changes.

### 5. Status changes

Admins can open the `More` menu from the header and change the ticket status to:

- `ACKNOWLEDGED`
- `WAITING_INFORMATION`
- `IN_PROGRESS`
- `SOLVED`
- `CANNOT_RESOLVE`
- `CLOSED`

The status update is immediately persisted, then the detail data is reloaded.

### 6. Creating tickets

Ticket creation happens in a separate page:

- `apps/web/app/admin/(authenticated)/ticket/create/page.tsx`

That page renders a form for:

- title
- description
- department
- client name
- client contact
- client location
- priority
- optional attachments

After creation, the user is redirected back to the dashboard with the new ticket selected.

### 7. Attachments

File uploads are restricted to:

- images
- videos
- PDFs

The UI validates file type and size before upload. The max file size is 10 MB.

When attachments are included in a message:

- the client first requests a presigned upload policy
- uploads the file directly to S3
- sends the uploaded metadata back in the message mutation

The same pattern is used for initial ticket attachments in the create form.

### 8. Notifications

The system sends notifications in these cases:

- a message is added to a ticket
- roles are assigned to a ticket
- ticket status changes

Notifications are sent to:

- admins assigned through ticket roles
- the original submitter when someone else changes the ticket status

## Technical Implementation

### Route and data loading

The dashboard wrapper lives in `apps/web/app/admin/(authenticated)/[tab]/dashboard/page.tsx`.

It:

- validates the `tab` slug
- redirects non-ticket tabs to the live dashboard
- checks `PERMISSIONS.TICKETS.VIEW`
- parses query parameters
- chooses the correct server-side ticket list function
- serializes the result and passes it into `TicketDashboardView`

The server-side list function depends on `view`:

- `all` -> `listTickets`
- `my` -> `listMyTickets`
- `unassigned` -> `listUnassignedTickets`
- `closed` -> `listClosedTickets`

### Client state model

`TicketDashboardView` is a client component that owns the following state:

- `selectedId`
- `detail`
- `message`
- `selectedFiles`
- `isSendingMessage`
- `searchTerm`
- `activeTab`

It also uses:

- `useRouter()` for refresh/navigation
- `useTransition()` for async detail loading and pending state
- `useRef()` for the hidden file input

### Detail hydration

Whenever `selectedId` changes, the component calls `getTicketDetailAction(selectedId)`.

That server action:

- checks `PERMISSIONS.TICKETS.VIEW`
- loads the ticket by ID
- loads ticket history
- enriches ticket and message attachments with cached presigned download URLs when `publicUrl` is missing
- returns a `TicketDetailResult`

The component stores the result in local state and renders the detail panel from that object.

### Search behavior

The list search is currently client-side only.

`TicketDashboardView` filters `initialItems` by:

- ticket title
- ticket code
- client name

There is no additional server round-trip when the search term changes.

### Message posting

Plain messages use `addTicketMessageAction`.

The flow is:

1. User types a message.
2. If there are no selected files, the client submits only the message body.
3. If there are files, each file is uploaded first through a presigned POST policy from `createTicketAttachmentUploadUrlAction`.
4. The client submits `addTicketMessageWithAttachmentsAction` with the uploaded metadata.
5. The UI clears the composer and re-fetches the ticket detail.

The file upload metadata includes:

- file name
- file size
- MIME type
- S3 key
- bucket when available

### Attachment validation

The client validates:

- allowed types: image, video, PDF
- max size: 10 MB

The server validates again:

- attachment schema correctness
- upload prefix ownership
- that message attachments are used through the message attachment action

For uploads tied to the current session, the server expects the S3 key to start with:

- `tickets/temp/${session.id}/`

### Status updates

`updateTicketStatusAction`:

- validates the new status
- checks `PERMISSIONS.TICKETS.VIEW`
- calls the database update function with the actor context
- notifies the original submitter if another admin changed the status
- revalidates the dashboard and ticket detail paths

### Assignment and priority updates

The server action layer also includes:

- `updateTicketPriorityAction`
- `updateTicketAssignedRolesAction`

These are not currently exposed directly from `TicketDashboardView`, but they are part of the ticket module and follow the same permission + revalidation pattern.

### Revalidation

Ticket mutations call `revalidateTicketPaths(ticketId)` which refreshes:

- `/admin/ticket/dashboard`
- `/admin/ticket/create`
- `/admin/ticket/${ticketId}`

This keeps the dashboard and detail pages consistent after mutations.

### Notifications pipeline

Notifications are written to the database and then published through Redis to per-admin channels:

- `admin-notifications:admin:${adminId}`

This is used for real-time admin notification delivery.

## Important Implementation Notes

- `initialView` and `initialHasMore` are passed into `TicketDashboardView` from the route wrapper, but the current client component does not use them yet.
- The ticket list search is local to the currently loaded page of items.
- `requestedTicketId` is respected only on initial mount; changing the URL later does not automatically sync selection in the current component.
- `useTransition()` is used for the initial detail fetch, but the component still relies on local state for the selected ticket payload.

## Files Involved

- `apps/web/app/admin/(authenticated)/[tab]/dashboard/page.tsx`
- `apps/web/app/admin/(authenticated)/ticket/actions.ts`
- `apps/web/app/admin/(authenticated)/ticket/components/ticket-dashboard-view.tsx`
- `apps/web/app/admin/(authenticated)/ticket/components/ticket-list-panel.tsx`
- `apps/web/app/admin/(authenticated)/ticket/components/ticket-detail-header.tsx`
- `apps/web/app/admin/(authenticated)/ticket/components/ticket-tab-content.tsx`
- `apps/web/app/admin/(authenticated)/ticket/components/ticket-dashboard-types.ts`
- `apps/web/app/admin/(authenticated)/ticket/components/ticket-dashboard-utils.ts`
