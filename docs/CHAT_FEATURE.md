# Chat Feature Technical Documentation

This document provides a technical overview and implementation details of the Chat feature within the EP Guard Scheduling system. The chat enables real-time communication between administrators and security guards (employees) across the Admin Dashboard, Employee PWA, and Mobile App.

---

## 1. System Architecture

The chat system is built on a real-time event-driven architecture using **Socket.io** and **Redis**.

-   **Backend:** Node.js (Next.js Custom Server) with Socket.io.
-   **Pub/Sub & Scaling:** Redis Adapter for Socket.io to sync events across multiple server instances.
-   **Database:** PostgreSQL with Prisma ORM for message persistence.
-   **Storage:** AWS S3 for message attachments (images and videos).
-   **Real-time Protocols:** WebSockets (via Socket.io) for instant delivery and typing indicators.
-   **Typed Contracts:** Shared TypeScript interfaces in `packages/types/src/socket-events.ts` ensure consistency between Backend, Web, and Mobile.

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
-   **Scoped Read Receipts:** `mark_read` event uses server-side scoped functions (`markAsReadForEmployee`, `markAsReadForAdmin`) to ensure users can only mark their own received messages as read.

#### Room Management
-   **Admins:** All connected administrators join the `admin` room.
-   **Employees:** Each employee joins a private room: `employee:${employeeId}`.

#### Core Events
-   `send_message`: Handles incoming messages, saves them to the DB, and broadcasts them to the appropriate rooms.
-   `mark_read`: Updates the `readAt` timestamp in the database and notifies the sender.
-   `typing`: Broadcasts typing status. Includes a 5-second auto-TTL on the client to clear stale "typing..." states.
-   `conversation_locked` (Admin only): A Redis-based lock mechanism (`chat_lock:${employeeId}`) that prevents multiple admins from responding to the same employee at the same time. Locks are acquired/refreshed on typing and sending.

#### Data Persistence (`apps/web/lib/data-access/chat.ts`)
Messages are stored in the `ChatMessage` table. Attachments are stored as S3 keys. On retrieval, the system dynamically generates **presigned URLs** via `enrichMessageWithUrls` to ensure secure access.

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

### 3.4 Mobile App (`apps/mobile/app/(tabs)/chat.tsx`)
A native React Native implementation for guards.

-   **Native Capabilities:** Uses `expo-image-picker` for camera and gallery access.
-   **Video Playback:** Uses `expo-video` for native video attachment playback.
-   **Keyboard Management:** Employs `react-native-keyboard-controller` for a smooth chat input experience.
-   **Persistence:** Syncs with the backend via WebSockets and refetches on app foregrounding to ensure no messages are missed.

---

## 4. Message Lifecycle

1.  **Compose:** User (Admin or Guard) creates a message with text and up to 4 attachments.
2.  **Upload:** Attachments are uploaded directly to S3; the server receives only the S3 keys.
3.  **Emit:** The client emits `send_message` via Socket.io.
4.  **Save:** The server saves the message to PostgreSQL.
5.  **Broadcast:** 
    *   If **Guard sends**: Broadcast to `admin` room and the guard's own `employee:${id}` room (for multi-device sync).
    *   If **Admin sends**: Broadcast to `employee:${targetId}` room and the `admin` room.
6.  **Read Receipt:** When the recipient views the message, a `mark_read` event is emitted, updating the DB and notifying the sender via `messages_read`.

---

## 5. Key Features & Constraints

| Feature | Implementation |
| :--- | :--- |
| **Max Attachments** | 4 files per message (Images/Videos). |
| **Real-time** | Socket.io with Redis scaling. |
| **Read Status** | Scoped `readAt` timestamp in DB, visual "Read" ticks in UI. |
| **Typing Indicator** | Transient `typing` socket event with 5s auto-clear TTL. |
| **Admin Concurrency** | Redis-based locking with UI enforcement (Phase 2 Overhaul). |
| **Typed Events** | End-to-end type safety via `@repo/types`. |
| **Offline Support** | TanStack Query caching for message history. |
