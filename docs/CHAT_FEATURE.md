# Chat Feature Technical Documentation

This document provides a technical overview and implementation details of the Chat feature within the EP Guard Scheduling system. The chat enables real-time communication between administrators and security guards (employees) across the Admin Dashboard, Employee PWA, and Mobile App.

Current state:
- Direct chat remains employee-keyed (`employeeId`) and uses legacy direct-chat events.
- Group chat is additive and uses separate data models, APIs, and socket events.
- The platform has not migrated yet to a fully unified generic conversation/thread model.

---

## 1. System Architecture

The chat system is built on a real-time event-driven architecture using **Socket.io** and **Redis**.

-   **Backend:** Node.js (Next.js Custom Server) with Socket.io.
-   **Pub/Sub & Scaling:** Redis Adapter for Socket.io to sync events across multiple server instances.
-   **Database:** PostgreSQL with Prisma ORM for message persistence.
-   **Storage:** AWS S3 for message attachments (images and videos).
-   **Real-time Protocols:** WebSockets (via Socket.io) for instant delivery and typing indicators.
-   **Typed Contracts:** Shared TypeScript interfaces in `packages/types/src/socket-events.ts` ensure consistency between Backend, Web, and Mobile.

### 1.1 Conversation Modes

- **Direct chat (legacy path):**
  - Employee-centric persistence (`ChatConversation`, `ChatMessage`, `AdminChatConversationState`).
  - Uses direct events: `send_message`, `new_message`, `typing`, `mark_read`, `messages_read`, `conversation_locked`.
  - Admin support locking applies only to direct chat.

- **Group chat (additive path):**
  - Group-centric persistence (`GroupChat`, `GroupChatParticipant`, `GroupChatMessage`, `GroupChatReadReceipt`, `GroupChatMembershipEvent`).
  - Uses separate events: `group_send_message`, `group_new_message`, `group_mark_read`, `group_messages_read`, `group_typing`.
  - No reuse of direct conversation locks for groups.

---

## 2. Technical Implementation

### 2.1 Backend (Socket.io & Redis)
The backend logic is modularized into specialized registrars under `apps/web/lib/socket/`:
-   `chat.ts`: Message handling, read receipts, and typing indicators.
-   `admin.ts`: Dashboard backfills and site subscriptions.
-   `employee.ts`: Real-time shift updates and session revocation.
-   `system.ts`: Redis-to-Socket.io bridge for alerts and global events.

#### Security & Authorization
-   **CORS:** Managed via `ALLOWED_ORIGINS` environment variable to restrict browser-based connections.
-   **Legacy Socket Runtime Flag:** `ENABLE_LEGACY_SOCKET_SERVER` controls whether `apps/web/server.ts` attaches the embedded Socket.IO server. Default behavior is enabled (unset or any value except `'false'`).
-   **Scoped Read Receipts:** `mark_read` event uses server-side scoped functions (`markAsReadForEmployee`, `markAsReadForAdmin`) to ensure users can only mark their own received messages as read.

#### Room Management
-   **Admins:** All connected administrators join the `admin` room.
-   **Employees:** Each employee joins a private room: `employee:${employeeId}`.

#### Core Events
-   `send_message`: Handles incoming messages. For text-only messages it creates a new DB row directly; for attachment messages it finalizes a previously reserved draft message and broadcasts it to the appropriate rooms.
-   `mark_read`: Updates the `readAt` timestamp in the database and notifies the sender.
-   `typing`: Broadcasts typing status. Includes a 5-second auto-TTL on the client to clear stale "typing..." states.
-   `conversation_locked` (Admin only): A Redis-based lock mechanism (`chat_lock:${employeeId}`) that prevents multiple admins from responding to the same employee at the same time. Locks are acquired/refreshed on typing and sending.
-   `group_send_message`: Sends or finalizes a group message, persists it, then emits `group_new_message` to active participants.
-   `group_mark_read`: Marks participant read state and emits `group_messages_read`.
-   `group_typing`: Emits typing state to other active participants in a group.

#### Data Persistence (`apps/web/lib/data-access/chat.ts`)
Messages are stored in the `ChatMessage` table. Attachment messages reserve a draft row first, then finalize that same row after S3 upload completes. Attachments are stored as S3 keys. On retrieval, the system dynamically generates **presigned URLs** via `enrichMessageWithUrls` to ensure secure access.

`ChatMessage` rows now have a lifecycle status:
-   `draft`: Reserved for attachment upload, hidden from normal chat/history/unread/export queries.
-   `sent`: Finalized and visible in normal chat flows.
-   `expired`: Abandoned draft that aged out and remains hidden.

#### Group Data Persistence (`apps/web/lib/data-access/group-chat.ts`)
Group messages and membership state are stored separately from direct chat:
- `GroupChat`: group metadata and conversation summary fields.
- `GroupChatParticipant`: membership, role, status, unread count, visibility window.
- `GroupChatMessage`: sent/draft/expired messages and attachment metadata.
- `GroupChatReadReceipt`: per-message per-participant read markers.
- `GroupChatMembershipEvent`: audit timeline for membership/ownership lifecycle events.

Membership and ownership rules:
- One owner at a time.
- Owner transfer fallback: earliest joined active participant.
- Last active participant leaving archives the group.

### 2.2 Authentication (`apps/web/lib/socket-auth.ts`)
Socket connections are authenticated using JWT tokens. 
-   **Web:** Tokens are extracted from HTTP-only cookies.
-   **Mobile:** Tokens are passed in the `auth` payload during the handshake.
-   The system verifies the session and attaches user metadata (`id`, `type`, `tokenVersion`, `clientType`) to the socket instance.

---

## 3. Client-Side Implementations

### 3.1 Common Hooks
Both Web and Mobile use declarative hooks for safer socket interactions:
-   `useSocket()`: Provides access to the authenticated socket instance and connection status.
-   `useSocketEvent(event, handler)`: Manages event registration and automatic cleanup, preventing memory leaks and duplicate listeners.

### 3.2 Admin Dashboard (`apps/web/app/admin/(authenticated)/chat`)
A comprehensive interface for managing multiple conversations.

-   **Conversation List:** Shows all active chats, sorted by the latest message, with unread counts and typing indicators.
-   **Filtering:** Admins can filter by "All", "Unread", or "My Chats".
-   **Locking Logic:** When an admin starts typing or sends a message, a Redis lock is acquired for 120 seconds. Other admins see a **Lock Icon** and have their input fields/send buttons disabled to prevent duplicate responses.
-   **Optimistic UI:** Uses local state to show message previews and optimization status before S3 upload completes.

### 3.3 Employee PWA (`apps/web/app/employee/(authenticated)/chat`)
A mobile-optimized web interface for guards.

-   **Infinite Scrolling:** Uses **TanStack Query** (`useInfiniteQuery`) for efficient message pagination.
-   **Intersection Observer:** Implements "Mark as Read" logic by detecting when an admin's message enters the viewport.
-   **Media Handling:** Supports image optimization before upload and a built-in image viewer.
-   **Attachment Draft Flow:** Reserves a server-generated draft `messageId` before uploading any attachment, then sends that `messageId` back through `send_message` to finalize the draft.

### 3.4 Mobile App (`apps/mobile/app/(tabs)/chat.tsx`)
A native React Native implementation for guards.

-   **Native Capabilities:** Uses `expo-image-picker` for camera and gallery access.
-   **Video Playback:** Uses `expo-video` for native video attachment playback.
-   **Keyboard Management:** Employs `react-native-keyboard-controller` for a smooth chat input experience.
-   **Persistence:** Syncs with the backend via WebSockets and refetches on app foregrounding to ensure no messages are missed.
-   **Attachment Draft Flow:** Matches web behavior by reserving a server draft before attachment upload instead of generating client-owned message IDs.

---

## 4. Message Lifecycle

1.  **Compose:** User (Admin or Guard) creates a message with text and up to 4 attachments.
2.  **Reserve Draft (attachments only):** The client calls `POST /api/shared/chat/[employeeId]/draft`, and the server creates a hidden `ChatMessage` row with `status = draft`, returning the canonical `messageId`.
3.  **Upload:** Attachments are uploaded directly to S3 under a path that includes the reserved `messageId`; the server receives only the S3 keys.
4.  **Emit:** The client emits `send_message` via Socket.io. Attachment-backed sends include the reserved `messageId`.
5.  **Finalize / Save:** 
    *   **Text-only:** The server creates a new `ChatMessage` row directly with `status = sent`.
    *   **With attachments:** The server finalizes the reserved draft row, populates content/attachments, stamps `sentAt`, and flips the status to `sent`.
6.  **Broadcast:** 
    *   If **Guard sends**: Broadcast to `admin` room and the guard's own `employee:${id}` room (for multi-device sync).
    *   If **Admin sends**: Broadcast to `employee:${targetId}` room and the `admin` room.
7.  **Read Receipt:** When the recipient views the message, a `mark_read` event is emitted, updating the DB and notifying the sender via `messages_read`.
8.  **Draft Cleanup:** The maintenance worker expires stale draft rows hourly. Expired drafts remain hidden from normal chat history and unread/export queries.

### 4.1 Group Message Lifecycle

1.  **Compose:** Participant (admin or employee) creates text and/or attachment message in a group.
2.  **Reserve Draft (attachments only):** Client calls `POST /api/shared/group-chat/[groupId]/draft` to reserve a canonical message row.
3.  **Upload:** Attachments are uploaded to S3 using the reserved `messageId`.
4.  **Emit:** Client emits `group_send_message` (with optional `messageId` when finalizing draft).
5.  **Finalize / Save:** Server finalizes reserved draft or creates a sent row directly for text-only sends.
6.  **Broadcast:** Server emits `group_new_message` to active participants of the group.
7.  **Read Receipt:** Clients emit `group_mark_read`; server updates participant state and emits `group_messages_read`.
8.  **Draft Cleanup:** Group drafts are also expired by maintenance and hidden from normal message history.

### 4.2 Group History Visibility

- New members only see messages from `visibleFromAt` onward.
- Left/removed members do not receive new messages.
- Previously visible history remains bounded by participant visibility/leave timestamps.

## 5. Group Chat Architecture

### 5.1 Data Model
- `GroupChat`
- `GroupChatParticipant`
- `GroupChatMessage`
- `GroupChatReadReceipt`
- `GroupChatMembershipEvent`

### 5.2 Socket Rooms
- Group room namespace: `group:{groupId}`.
- Delivery target rooms for active participants: `admin:{adminId}` and `employee:{employeeId}`.

### 5.3 Group Events
- `group_send_message`
- `group_new_message`
- `group_mark_read`
- `group_messages_read`
- `group_typing`
- Reserved for future expansion: `group_member_added`, `group_member_removed`, `group_owner_changed`, `group_updated`

### 5.4 Push Notifications
- Group push notifications are sent to active, non-muted employee participants except the sender.

---

## 6. Key Features & Constraints

| Feature | Implementation |
| :--- | :--- |
| **Max Attachments** | 4 files per message (Images/Videos). |
| **Real-time** | Socket.io with Redis scaling. |
| **Attachment Identity** | Canonical message IDs are server-reserved before upload; clients no longer own attachment message IDs. |
| **Read Status** | Scoped `readAt` timestamp in DB, visual "Read" ticks in UI. |
| **Typing Indicator** | Transient `typing` socket event with 5s auto-clear TTL. |
| **Admin Concurrency** | Redis-based locking with UI enforcement (Phase 2 Overhaul). |
| **Draft Cleanup** | Attachment drafts expire after TTL and are hidden from chat/history/export. |
| **Typed Events** | End-to-end type safety via `@repo/types`. |
| **Offline Support** | TanStack Query caching for message history. |

## 7. Direct vs Group and Migration Path

- Direct chat remains the primary employee-keyed legacy implementation.
- Group chat is implemented as additive behavior, intentionally separated from direct event/model contracts.
- Future migration may converge both into a generic conversation/thread model, but this has not been executed in the current implementation.
