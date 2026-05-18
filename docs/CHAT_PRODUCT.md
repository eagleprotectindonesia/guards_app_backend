# Chat Product Documentation

This document describes chat as a product feature across Admin Dashboard, Employee PWA, and Mobile App.

Related docs:
- Socket implementation and auth: [`docs/SOCKET_IMPLEMENTATION.md`](/home/tian/Documents/Work/guards_app_backend/docs/SOCKET_IMPLEMENTATION.md)

## 1. Scope

Chat currently has 2 conversation modes:
- Direct chat (admin <-> employee), employee-keyed legacy flow.
- Group chat (admins and employees), additive flow with separate data model and events.

The platform has not fully migrated to a single generic conversation/thread model.

## 2. Direct Chat (Legacy Path)

Core user behavior:
- Admins can respond to guards in 1:1 threads.
- Guards can chat with admins from PWA and mobile.
- Typing indicators, read receipts, and attachment sending are supported.
- Admin concurrency lock prevents multiple admins from replying at the same time in the same direct thread.

Key constraints:
- Conversation identity is `employeeId`.
- Max 4 attachments per message.
- Attachment-backed messages use draft reservation before upload finalization.

## 3. Group Chat (Additive Path)

Core user behavior:
- Admins and employees can participate in group threads.
- Group messages support text + attachments.
- Group typing and read receipts are separate from direct chat contracts.
- Group ownership/membership lifecycle is tracked.

Membership behavior:
- One owner at a time.
- If owner leaves, ownership transfers to earliest joined active participant.
- If owner is admin, leave is blocked unless another active admin exists; ownership transfers to earliest joined active admin.
- If last active participant leaves, group is archived.

Visibility behavior:
- New members only see history from `visibleFromAt` onward.
- Left/removed members do not receive new group messages.

## 4. Message Lifecycle

### 4.1 Direct

1. User composes text and/or attachment message.
2. Attachment flow reserves draft row via `POST /api/shared/chat/[employeeId]/draft`.
3. Client uploads attachment(s) using reserved message ID.
4. Client emits `send_message`.
5. Server creates/finalizes message (`sent`).
6. Realtime delivery to recipient and sender-side sync rooms.
7. Recipient emits `mark_read`; sender receives `messages_read`.
8. Maintenance job expires stale drafts (`expired`).

### 4.2 Group

1. Participant composes text and/or attachment message.
2. Attachment flow reserves draft row via `POST /api/shared/group-chat/[groupId]/draft`.
3. Client uploads attachment(s) using reserved message ID.
4. Client emits `group_send_message`.
5. Server creates/finalizes message (`sent`).
6. Realtime delivery to active group participants.
7. Participant emits `group_mark_read`; peers receive `group_messages_read`.
8. Maintenance job expires stale drafts (`expired`).

## 5. Client Surfaces

- Admin web: direct and group management, filtering, lock visibility for direct chat.
- Employee PWA: direct + group chat experience with paginated history.
- Mobile app: direct + group chat with native media support.

Shared UX guarantees:
- Real-time updates when online.
- History sync after reconnect/foreground.
- Attachment URL access via server-side presigned URL enrichment.

## 6. Product-Level Event Map

Direct chat:
- `send_message`
- `new_message`
- `mark_read`
- `messages_read`
- `typing`
- `conversation_locked`

Group chat:
- `group_send_message`
- `group_new_message`
- `group_mark_read`
- `group_messages_read`
- `group_typing`

## 7. Current State Summary

- Direct chat remains the primary legacy contract.
- Group chat is production additive behavior with separate models/events.
- Realtime transport is now handled by the separated realtime socket service (not only for chat).
