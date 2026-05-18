# Socket Technical Implementation

This document covers socket/realtime architecture and authentication. This service is not chat-only.

Related docs:
- Chat product behavior (direct + group): [`docs/CHAT_PRODUCT.md`](/home/tian/Documents/Work/guards_app_backend/docs/CHAT_PRODUCT.md)

## 1. Realtime Service Scope

The separated realtime socket service owns:
- Socket.IO connection lifecycle.
- Socket authentication and role resolution.
- Room joins and fanout.
- Realtime handlers for chat and non-chat features.
- Redis adapter and pub/sub propagation across instances.

The service is intentionally decoupled from Next.js app runtime.

## 2. Transport and Scaling

- Protocol: Socket.IO over WebSocket/HTTP fallback.
- Horizontal fanout: `@socket.io/redis-adapter`.
- CORS control: `ALLOWED_ORIGINS`.
- Shared event contracts: `packages/types/src/socket-events.ts`.

## 3. Authentication Model

Socket auth logic lives in the socket auth layer (historically `apps/web/lib/socket-auth.ts`, then reused for separated runtime).

Handshake inputs:
- Web clients: HTTP-only auth cookies.
- Mobile clients: token in Socket.IO `auth` payload.

Server behavior:
- Validates session/JWT.
- Resolves identity and role (`admin` or `employee`).
- Attaches normalized auth context to `socket.data.auth` (user id/type/session metadata/token version/client type).
- Rejects unauthorized socket connections.

## 4. Room Model

Core rooms:
- `admin`
- `employee:{employeeId}`
- `admin:{adminId}` (targeted admin fanout where used)
- `group:{groupId}` (group chat channel)

## 5. Event Families

### 5.1 Chat Events

Direct chat events:
- `send_message`
- `new_message`
- `mark_read`
- `messages_read`
- `typing`
- `conversation_locked`

Group chat events:
- `group_send_message`
- `group_new_message`
- `group_mark_read`
- `group_messages_read`
- `group_typing`

### 5.2 Non-Chat Realtime Events

Examples of non-chat usage handled by the same socket service:
- `dashboard:backfill`
- `admin_notification_created`
- `admin_notifications_backfill`
- `admin_notifications_read`
- `auth:force_logout`
- `shift:updated`
- alert and shift stream events (`alert`, `active_shifts`, `upcoming_shifts`)

## 6. Authorization and Data Integrity Notes

- Read receipts are server-scoped to prevent clients marking messages they do not own.
- Direct admin lock uses Redis key pattern `chat_lock:{employeeId}` with TTL refresh on typing/send.
- Attachment messages use server-reserved draft IDs before finalization to keep canonical identity and idempotent retries.

## 7. Operational Notes

- Keep only one runtime owning certain Redis subscribers during staged migrations to avoid duplicate emits.
- Push fallback behavior for offline recipients must remain centralized and deduplicated.
- Legacy `ENABLE_LEGACY_SOCKET_SERVER` flag may still exist during cleanup to support rollback/cutover.

## 8. Current State Summary

- Realtime socket service is already separated from Next.js in production.
- Final cleanup may still include removing residual legacy runtime wiring/docs that assume embedded Socket.IO in `apps/web`.
