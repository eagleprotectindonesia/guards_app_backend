Below is a **Codex-ready multi-phase implementation plan**. It assumes **Option A**: add group chat beside the existing direct chat, while slowly introducing generic conversation concepts in the UI/API layer.

The reason for this plan is that the current implementation is strongly `employeeId`-centric: `ChatConversation` is keyed by `employeeId`, `ChatMessage` requires `employeeId`, and `AdminChatConversationState` stores admin state per `adminId + employeeId`.  The repository also syncs direct conversation summaries by `employeeId`, and read/unread logic is direct-chat-specific.  Current socket contracts also pass `employeeId` for messages, typing, read receipts, and locks. 

---

# Codex Implementation Plan: Group Chat V1

## Goal

Implement group chat in the guards app monorepo without breaking the existing direct admin-to-employee chat.

Use **additive group-chat tables, routes, socket events, repositories, and UI**, while preserving all current direct chat behavior.

## Non-goals for V1

Do **not** migrate existing direct chat into a unified `ChatThread` system yet.

Do **not** replace `ChatConversation`, `ChatMessage`, or `AdminChatConversationState`.

Do **not** overload existing direct socket events like `send_message`, `new_message`, `typing`, or `messages_read` with group behavior.

Do **not** use `conversation_locked` for group chats. Current locking is admin-support-specific and keyed by employee conversation. 

---

## Phase 0 — Safety setup and baseline

### Objective

Confirm current chat behavior stays unchanged while adding new group chat functionality.

### Tasks

1. Identify current direct chat touchpoints:

   * `packages/database/prisma/schema.prisma`
   * `packages/database/src/repositories/chat.ts`
   * `packages/types/src/socket-events.ts`
   * `apps/web/lib/socket/chat.ts`
   * `apps/web/hooks/use-admin-chat.ts`
   * `apps/web/app/api/shared/chat/**`
   * `apps/mobile/app/(tabs)/chat.tsx`
   * `apps/mobile/src/hooks/useChatMessages.ts`
   * `apps/mobile/src/api/queryKeys.ts`

2. Add TODO notes or tracking comments only where helpful, but avoid refactoring direct chat in this phase.

3. Ensure existing tests pass before starting.

### Acceptance criteria

* Existing direct chat behavior remains untouched.
* Existing direct socket event names remain unchanged.
* Existing mobile direct chat still uses current `send_message` behavior.
* No schema changes yet.

---

## Phase 1 — Database schema for group chat

### Objective

Add group-chat data models that support membership, ownership, message history visibility, unread counts, and future read receipts.

### File

`packages/database/prisma/schema.prisma`

### Add enums

```prisma
enum GroupChatParticipantType {
  admin
  employee
}

enum GroupChatParticipantRole {
  owner
  admin
  member
}

enum GroupChatParticipantStatus {
  active
  left
  removed
}

enum GroupChatMembershipEventType {
  created
  member_added
  member_removed
  member_left
  owner_transferred
  group_updated
  group_archived
}
```

### Add models

```prisma
model GroupChat {
  id                  String   @id @default(uuid())
  title               String
  description         String?  @db.Text
  createdByAdminId    String?  @map("created_by_admin_id")
  createdByEmployeeId String?  @map("created_by_employee_id")

  lastMessageAt       DateTime? @map("last_message_at")
  lastMessageContent  String?   @map("last_message_content") @db.Text
  lastMessageSenderName String? @map("last_message_sender_name")

  archivedAt          DateTime? @map("archived_at")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  participants        GroupChatParticipant[]
  messages            GroupChatMessage[]
  events              GroupChatMembershipEvent[]

  @@index([lastMessageAt(sort: Desc)])
  @@index([archivedAt])
  @@map("group_chats")
}

model GroupChatParticipant {
  id              String @id @default(uuid())
  groupId         String @map("group_id")

  participantType GroupChatParticipantType @map("participant_type")
  adminId         String? @map("admin_id")
  employeeId      String? @map("employee_id")

  role            GroupChatParticipantRole @default(member)
  status          GroupChatParticipantStatus @default(active)

  joinedAt        DateTime @default(now()) @map("joined_at")
  visibleFromAt   DateTime @default(now()) @map("visible_from_at")
  leftAt          DateTime? @map("left_at")
  removedAt       DateTime? @map("removed_at")
  removedByParticipantId String? @map("removed_by_participant_id")

  lastReadAt      DateTime? @map("last_read_at")
  unreadCount     Int @default(0) @map("unread_count")

  isMuted         Boolean @default(false) @map("is_muted")
  isArchived      Boolean @default(false) @map("is_archived")

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  group           GroupChat @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@index([groupId, status])
  @@index([adminId, status])
  @@index([employeeId, status])
  @@index([participantType, adminId])
  @@index([participantType, employeeId])
  @@map("group_chat_participants")
}

model GroupChatMessage {
  id                  String @id @default(uuid())
  groupId             String @map("group_id")
  senderParticipantId String @map("sender_participant_id")

  senderType          GroupChatParticipantType @map("sender_type")
  adminId             String? @map("admin_id")
  employeeId          String? @map("employee_id")
  senderName          String @map("sender_name")

  status              ChatMessageStatus @default(sent)
  content             String @db.Text
  attachments         String[] @default([])
  latitude            Float?
  longitude           Float?

  createdAt           DateTime @default(now()) @map("created_at")
  sentAt              DateTime? @map("sent_at")
  draftExpiresAt      DateTime? @map("draft_expires_at")

  group               GroupChat @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@index([groupId, createdAt])
  @@index([senderParticipantId])
  @@index([status, draftExpiresAt])
  @@map("group_chat_messages")
}

model GroupChatReadReceipt {
  id            String @id @default(uuid())
  messageId     String @map("message_id")
  participantId String @map("participant_id")
  readAt        DateTime @default(now()) @map("read_at")

  @@unique([messageId, participantId])
  @@index([participantId, readAt])
  @@map("group_chat_read_receipts")
}

model GroupChatMembershipEvent {
  id                   String @id @default(uuid())
  groupId              String @map("group_id")
  actorParticipantId   String? @map("actor_participant_id")
  targetParticipantId  String? @map("target_participant_id")
  type                 GroupChatMembershipEventType
  metadata             Json?
  createdAt            DateTime @default(now()) @map("created_at")

  group                GroupChat @relation(fields: [groupId], references: [id], onDelete: Cascade)

  @@index([groupId, createdAt])
  @@map("group_chat_membership_events")
}
```

### Important schema note

Prisma cannot express perfect conditional uniqueness like “unique active employee participant per group when employeeId is not null” in a simple cross-database way. Add application-level checks in repositories:

```ts
Only one active participant per group per employeeId/adminId.
```

If the project is comfortable with PostgreSQL partial indexes, add custom SQL migration indexes later.

### Acceptance criteria

* Prisma schema validates.
* Existing direct chat models are unchanged.
* Migration is additive.
* New models support:

  * group creation
  * active/left/removed membership
  * single owner
  * unread per participant
  * message drafts
  * join-time history visibility

---

## Phase 2 — Shared TypeScript contracts

### Objective

Add group chat types and socket events without touching direct chat events.

### Files

* `packages/types/src/index.ts`
* `packages/types/src/socket-events.ts`

The existing shared `Conversation` and `ChatMessage` types are direct-chat-shaped and require `employeeId`.  Add separate group types.

### Add types

```ts
export type GroupChatParticipantType = 'admin' | 'employee';
export type GroupChatParticipantRole = 'owner' | 'admin' | 'member';
export type GroupChatParticipantStatus = 'active' | 'left' | 'removed';

export interface GroupChatParticipant {
  id: string;
  groupId: string;
  participantType: GroupChatParticipantType;
  adminId?: string | null;
  employeeId?: string | null;
  displayName: string;
  role: GroupChatParticipantRole;
  status: GroupChatParticipantStatus;
  joinedAt: string;
  visibleFromAt: string;
  leftAt?: string | null;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
}

export interface GroupChatMessage {
  id: string;
  groupId: string;
  senderParticipantId: string;
  senderType: GroupChatParticipantType;
  adminId?: string | null;
  employeeId?: string | null;
  senderName: string;
  content: string;
  attachments: string[];
  latitude?: number | null;
  longitude?: number | null;
  status?: 'draft' | 'sent' | 'expired';
  createdAt: string;
  sentAt?: string | null;
  draftExpiresAt?: string | null;
}

export interface GroupChatConversation {
  kind: 'group';
  groupId: string;
  title: string;
  description?: string | null;
  memberCount: number;
  currentUserRole: GroupChatParticipantRole;
  isArchived: boolean;
  isMuted: boolean;
  unreadCount: number;
  lastMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
}
```

### Add socket events

In `ServerToClientEvents`:

```ts
group_new_message: (message: GroupChatMessage) => void;

group_messages_read: (data: {
  groupId: string;
  participantId: string;
  messageIds?: string[];
  readAt: string;
}) => void;

group_typing: (data: {
  groupId: string;
  participantId: string;
  participantName: string;
  isTyping: boolean;
}) => void;

group_member_added: (data: {
  groupId: string;
  participant: GroupChatParticipant;
}) => void;

group_member_removed: (data: {
  groupId: string;
  participantId: string;
  removedByParticipantId?: string;
}) => void;

group_owner_changed: (data: {
  groupId: string;
  previousOwnerParticipantId: string;
  newOwnerParticipantId: string;
}) => void;

group_updated: (data: {
  groupId: string;
  title?: string;
  description?: string | null;
}) => void;
```

In `ClientToServerEvents`:

```ts
group_send_message: (data: {
  groupId: string;
  messageId?: string;
  content: string;
  attachments?: string[];
  latitude?: number;
  longitude?: number;
}) => void;

group_mark_read: (data: {
  groupId: string;
  messageIds?: string[];
}) => void;

group_typing: (data: {
  groupId: string;
  isTyping: boolean;
}) => void;
```

### Acceptance criteria

* Existing socket event types remain backward-compatible.
* Direct chat clients compile unchanged.
* Group socket contracts are explicit and use `groupId`, not `employeeId`.

---

## Phase 3 — Database repository layer

### Objective

Create group chat repository functions in `packages/database`.

### New file

`packages/database/src/repositories/group-chat.ts`

Export from package barrel if needed.

### Required repository functions

```ts
createGroupChat(params)
getGroupChatForParticipant(params)
getGroupChatListForParticipant(params)
addGroupMembers(params)
removeGroupMember(params)
leaveGroup(params)
transferOwnershipIfNeeded(params)
reserveGroupMessageDraft(params)
finalizeGroupMessageDraft(params)
saveGroupMessage(params)
getGroupMessages(params)
getGroupMessagesSince(params)
markGroupAsRead(params)
expireStaleGroupChatDrafts(params)
```

### Core rules

#### Create group

* Creator becomes `owner`.
* Initial employees become `member`.
* Add a `created` membership event.
* Validate title is not empty.
* Validate all employee IDs exist and are active if that is your project convention.

#### Add members

* Only `owner` can add members in V1.
* Do not add duplicate active members.
* Re-adding a removed/left member should either:

  * reactivate same participant row, or
  * create a new row.
* Prefer creating a new row if audit clarity matters.
* Set `visibleFromAt = now()`.

#### Remove members

* Only `owner` can remove members.
* Owner cannot remove self through remove endpoint; use leave endpoint.
* Removed participant:

  * `status = removed`
  * `removedAt = now`
  * `leftAt = now`
* Removed users keep old visible history but receive no new messages.

#### Leave group

* Any active member can leave.
* If owner leaves:

  * promote earliest joined active participant to `owner`.
  * if no active participants remain, archive the group.
* Use one DB transaction.

#### Ownership transfer

Use deterministic rule:

```ts
next owner = active participant ordered by joinedAt ASC
```

Skip removed/left participants.

#### Save message

* Sender must be active participant.
* Message sender fields should be denormalized:

  * `senderParticipantId`
  * `senderType`
  * `adminId`
  * `employeeId`
  * `senderName`
* Update group summary:

  * `lastMessageAt`
  * `lastMessageContent`
  * `lastMessageSenderName`
* Increment unread count for every active participant except sender.

#### Message visibility

When fetching messages, use participant visibility:

```ts
createdAt >= participant.visibleFromAt
createdAt <= participant.leftAt if leftAt is set
status = sent
```

#### Mark read

* Set participant `lastReadAt = now`.
* Set participant `unreadCount = 0`.
* Optional V1: insert `GroupChatReadReceipt` for provided message IDs.

### Acceptance criteria

* Repository unit tests cover:

  * create group
  * add member
  * remove member
  * owner leaves and ownership transfers
  * last member leaves and group archives
  * new member cannot see old messages
  * unread count increments only for other active participants
  * mark read resets current participant unread count

---

## Phase 4 — Web data-access wrappers and S3 URL enrichment

### Objective

Mirror the existing direct chat S3 enrichment pattern for group chat.

The current web data-access layer wraps database chat functions and enriches attachment keys with presigned URLs.  Do the same for group messages.

### New file

`apps/web/lib/data-access/group-chat.ts`

### Implement

```ts
enrichGroupMessageWithUrls(message)
saveGroupMessage(...)
finalizeGroupMessageDraft(...)
getGroupMessages(...)
getGroupMessagesSince(...)
```

Re-export repository functions that do not need URL enrichment.

### Acceptance criteria

* Group chat attachments return presigned URLs just like direct chat.
* Direct chat data-access remains unchanged.

---

## Phase 5 — REST API routes

### Objective

Add group chat APIs beside existing `/api/shared/chat/**`.

Current direct conversation list route requires `chat:view` permission for admins.  Reuse existing `chat:view` and `chat:create` permissions for group chat V1, because permission constants already define `CHAT.VIEW` and `CHAT.CREATE`. 

### New routes

```txt
GET    apps/web/app/api/shared/group-chat/route.ts
POST   apps/web/app/api/shared/group-chat/route.ts

GET    apps/web/app/api/shared/group-chat/[groupId]/route.ts
PATCH  apps/web/app/api/shared/group-chat/[groupId]/route.ts

GET    apps/web/app/api/shared/group-chat/[groupId]/messages/route.ts
POST   apps/web/app/api/shared/group-chat/[groupId]/draft/route.ts

POST   apps/web/app/api/shared/group-chat/[groupId]/members/route.ts
DELETE apps/web/app/api/shared/group-chat/[groupId]/members/[participantId]/route.ts

POST   apps/web/app/api/shared/group-chat/[groupId]/leave/route.ts
POST   apps/web/app/api/shared/group-chat/[groupId]/read/route.ts
```

### Access rules

Admin:

* `chat:view` required to list/read groups.
* `chat:create` required to create groups, add/remove members, send messages.

Employee:

* Must be an active participant for group read/send.
* Must be owner for add/remove members if employee-created groups are allowed.
* If employee-created groups are not allowed in V1, employees can only read/send/leave.

### Request validation

Use existing validation package style if available. Otherwise, add local validation first, then move shared schemas later.

Validate:

```ts
title: non-empty string
employeeIds: string[]
content: string
attachments: max 4
groupId: uuid/string
```

### Acceptance criteria

* Admin can create group with employees.
* Active participants can fetch group list.
* Active participants can fetch visible messages.
* New member only sees messages after join.
* Removed member cannot fetch new messages.
* Owner can add/remove members.
* Owner leaving transfers ownership.

---

## Phase 6 — Socket.io group chat events

### Objective

Add real-time group chat behavior without disturbing direct chat socket behavior.

### File

`apps/web/lib/socket/chat.ts`

Current handler already manages direct `send_message`, `mark_read`, and `typing`.  Add group handlers in the same file or split into `apps/web/lib/socket/group-chat.ts` and register from the socket setup.

### Socket rooms

Add:

```ts
group:${groupId}
```

On socket connection:

* Load active group memberships for the authenticated user.
* Join all `group:${groupId}` rooms.

This may belong in the general socket connection setup, not inside each event handler.

### Add handlers

#### `group_send_message`

Flow:

1. Verify user is active group participant.
2. Validate attachments length <= 4.
3. If `messageId` exists, finalize draft.
4. Else create message directly.
5. Broadcast to `group:${groupId}`:

   * `group_new_message`
6. Send push notifications to offline/muted-eligible participants in later phase.

#### `group_mark_read`

Flow:

1. Verify user is active participant.
2. Mark participant unread count 0.
3. Emit to room:

   * `group_messages_read`

#### `group_typing`

Flow:

1. Verify user is active participant.
2. Emit to `group:${groupId}` except sender:

   * `group_typing`

### Do not use lock

Do not set Redis keys like `chat_lock:${groupId}`.

### Acceptance criteria

* Connected group participants receive new messages in real time.
* Sender receives own message for multi-device sync.
* Typing indicators appear only to other group participants.
* Removed/left participants do not receive events after leave/removal.
* Existing direct events still work.

---

## Phase 7 — Push notifications

### Objective

Add group push notification behavior for offline employee participants.

### Files

Likely:

* `apps/web/lib/fcm.ts`
* group socket handler
* worker if notification sending is queued

Current direct chat push sends to an employee if no socket is connected in `employee:${targetId}`.  For group chat, check each employee participant.

### Implement

```ts
sendGroupChatPushNotification({
  employeeId,
  groupId,
  groupTitle,
  senderName,
  content,
  messageId,
})
```

Payload:

```ts
{
  type: 'group_chat_message',
  groupId,
  messageId
}
```

Notification title/body:

```txt
{groupTitle}
{senderName}: {message preview}
```

Or safer:

```txt
New message in {groupTitle}
```

### Rules

* Do not push to sender.
* Do not push to muted participants.
* Do not push to removed/left participants.
* Optionally skip push if the employee has active sockets.

### Acceptance criteria

* Offline employee participants receive group message push.
* Muted participants do not receive push.
* Direct chat push still works unchanged.

---

## Phase 8 — Web admin UI

### Objective

Add group chat management and group message UI to admin web.

### Current state

`use-admin-chat.ts` is built around direct conversations: `activeEmployeeId`, `archivedEmployeeIds`, `typingEmployees`, direct conversation query keys, and cache updates based on `message.employeeId`.  Avoid large refactor in V1.

### Recommended approach

Add a separate hook first:

```ts
apps/web/hooks/use-admin-group-chat.ts
```

Later both hooks can be unified.

### UI changes

Add chat mode tabs:

```txt
Direct
Groups
```

Group list item:

```txt
Group title
member count
last sender + last message
unread badge
muted/archive state
```

Group detail:

```txt
Header:
  group title
  member count
  owner/admin badge
  manage members button

Body:
  messages

Composer:
  text
  attachments
  location optional

Side panel/modal:
  member list
  add members
  remove members
  leave group
  owner badge
```

### New hook responsibilities

```ts
useAdminGroupChat()
```

State:

```ts
activeGroupId
groups
messages
inputText
selectedFiles
typingParticipants
pendingMemberModal
```

Query keys:

```ts
['admin', 'group-chat', 'groups', view, search]
['admin', 'group-chat', 'messages', groupId]
```

Socket subscriptions:

```ts
group_new_message
group_messages_read
group_typing
group_member_added
group_member_removed
group_owner_changed
group_updated
```

### Upload behavior

Reuse direct pattern:

1. Reserve group draft:

   * `POST /api/shared/group-chat/:groupId/draft`
2. Upload attachments to S3 with:

```ts
folder: 'group-chat'
conversationId: groupId
messageId
```

3. Emit `group_send_message`.

### Acceptance criteria

* Admin can create group.
* Admin owner can add/remove employees.
* Admin can send/receive group messages.
* Admin can see unread badges.
* Admin can mark group messages as read.
* Admin can leave group and ownership transfers.
* Direct chat UI remains functional.

---

## Phase 9 — Mobile group inbox and group chat screen

### Objective

Evolve mobile from single direct chat screen into chat inbox + direct/group chat screens.

### Current state

Mobile currently has one chat screen for direct chat, sends direct messages through `send_message`, and uses authenticated employee ID as the conversation identity.  The mobile message hook fetches `/api/shared/chat/${employeeId}` and query keys are direct-chat-specific.  Query keys also currently store direct chat messages under `['chat', 'messages', employeeId]`. 

### Add query keys

In `apps/mobile/src/api/queryKeys.ts`:

```ts
chat: {
  unread: ['chat', 'unread'] as const,
  messages: (employeeId?: string) => ['chat', 'messages', employeeId] as const,
  inbox: ['chat', 'inbox'] as const,
  groupList: ['chat', 'groups'] as const,
  groupMessages: (groupId?: string) => ['chat', 'group-messages', groupId] as const,
}
```

### Add mobile screens

Recommended:

```txt
apps/mobile/app/(tabs)/chat/index.tsx
apps/mobile/app/(tabs)/chat/direct.tsx
apps/mobile/app/(tabs)/chat/group/[groupId].tsx
```

If Expo Router structure makes this difficult, keep existing direct chat screen and add a group list modal first.

### Chat inbox

Show:

```txt
Admin Support
Group: Site A Night Shift
Group: Office Security
```

Each item should use a generic shape:

```ts
type MobileChatInboxItem =
  | { kind: 'direct'; employeeId: string; title: string; unreadCount: number }
  | { kind: 'group'; groupId: string; title: string; unreadCount: number };
```

### Group chat hook

Add:

```ts
apps/mobile/src/hooks/useGroupChatMessages.ts
```

Responsibilities:

* Fetch group messages.
* Listen to `group_new_message`.
* Emit `group_mark_read`.
* Reconcile on foreground using `since`.
* Handle read/unread cache invalidation.

### Composer reuse

Reuse `ChatComposer` as much as possible.

Change send flow for group:

```ts
socket.emit('group_send_message', {
  groupId,
  content,
  messageId,
  attachments
});
```

### Acceptance criteria

* Employee can see direct chat plus group chats.
* Employee can open group chat.
* Employee can send/receive group messages.
* Employee can upload group attachments.
* Employee can leave group.
* Removed employee no longer receives new messages.

---

## Phase 10 — Tests

### Objective

Protect direct chat from regressions and verify group behavior.

### Add repository tests

Test cases:

```txt
create group creates owner participant
create group creates employee participants
add member sets visibleFromAt to now
new member cannot see older messages
removed member cannot send
removed member cannot receive message list beyond leftAt
owner can remove member
member cannot remove member
owner leaving transfers ownership to earliest joined active participant
last member leaving archives group
sending message increments unread for other participants
mark read resets unread count
draft reservation/finalization works
expired group drafts are hidden
```

### Add API tests

Test cases:

```txt
admin with chat:create can create group
admin without chat:create cannot create group
participant can list own groups
non-participant cannot fetch group
owner can add member
non-owner cannot add member
owner can remove member
non-owner cannot remove member
participant can leave
```

### Add socket tests if existing infra supports it

Test cases:

```txt
group_send_message broadcasts to group room
group_typing broadcasts to other participants
group_mark_read emits read event
removed member no longer receives group_new_message
direct send_message still works
```

### Add mobile/web integration smoke checks

At minimum:

```txt
direct chat still loads
group list loads
group messages load
send group message updates cache
```

---

## Phase 11 — Documentation

### Objective

Update technical documentation to explain direct chat vs group chat.

### File

`docs/CHAT_FEATURE.md`

Current docs describe direct room management, direct message lifecycle, and employee/admin chat behavior.  Add a new section.

### Add sections

```md
## Group Chat Architecture

### Data Model
- GroupChat
- GroupChatParticipant
- GroupChatMessage
- GroupChatReadReceipt
- GroupChatMembershipEvent

### Ownership
- One owner at a time
- Owner transfer rule: earliest joined active participant
- Last member leaving archives group

### History Visibility
- New members see messages from visibleFromAt
- Removed/left members keep old visible history but receive no new messages

### Socket Rooms
- group:{groupId}

### Events
- group_send_message
- group_new_message
- group_mark_read
- group_messages_read
- group_typing
- group_member_added
- group_member_removed
- group_owner_changed
- group_updated

### Push Notifications
- Sent to active non-muted employee participants except sender
```

### Acceptance criteria

* Docs clearly distinguish direct chat and group chat.
* Docs mention that direct chat remains employee-keyed for now.
* Docs explain future migration path to generic conversations.

---

## Phase 12 — Future unification preparation

### Objective

Prepare for eventual unified chat without doing the migration now.

### Add generic app-layer types

In a shared app type file:

```ts
type ConversationKind = 'direct' | 'group';

type ConversationKey =
  | { kind: 'direct'; employeeId: string }
  | { kind: 'group'; groupId: string };

type ChatInboxItem = {
  kind: ConversationKind;
  id: string;
  title: string;
  subtitle?: string;
  unreadCount: number;
  isMuted: boolean;
  isArchived: boolean;
  lastMessage?: {
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
};
```

### Do this gradually

* Do not refactor all direct chat code immediately.
* Use this shape in new group UI.
* Later adapt direct chat list to the same shape.

### Acceptance criteria

* New code avoids hardcoding `employeeId` as “conversation ID.”
* New UI components accept generic conversation/message props where practical.
* Future `ChatThread` migration remains possible.

---

# Suggested PR breakdown

## PR 1 — Schema and repository

Includes:

* Prisma group chat models
* repository functions
* repository tests

No UI. No sockets.

## PR 2 — Shared types and API routes

Includes:

* group chat shared types
* REST routes
* API tests

No UI except maybe manual API testing.

## PR 3 — Socket group events

Includes:

* group socket rooms
* `group_send_message`
* `group_typing`
* `group_mark_read`
* socket tests if possible

## PR 4 — Web admin group UI

Includes:

* group list
* group detail
* create group
* add/remove members
* send/read messages

## PR 5 — Mobile group inbox and group screen

Includes:

* mobile chat inbox
* group message screen
* group send/receive
* group attachment upload

## PR 6 — Push notifications, polish, docs

Includes:

* group push
* docs
* edge-case fixes
* performance polish

---

# Final guardrails for Codex

Use these as explicit instructions:

```txt
Do not modify existing direct chat behavior unless absolutely necessary.

Do not replace employeeId-based direct chat in this implementation.

Do not overload existing socket events for group chat.

Do not use conversation_locked for group chat.

Do not store group members in JSON.

Do not use ChatMessage.readAt for group read receipts.

Do not let new members see old messages before visibleFromAt.

Do not allow removed/left members to send new group messages.

Do not allow non-owners to add/remove members in V1.

When owner leaves, transfer ownership in a DB transaction to the earliest joined active participant.

If no active participants remain, archive the group.

Keep reusable UI pieces generic where practical, but avoid large direct-chat refactors in V1.
```

This plan should give Codex enough structure to implement group chat incrementally without turning the current direct chat into a risky rewrite.
