# Chat Implementation Review Findings

## Scope
Reviewed:
- Backend socket/auth/data paths
- Admin web chat
- Employee PWA chat
- Mobile chat/PWA unread integrations
- Chat docs and chat-related tests

## Findings (Ordered by Severity)

### 1. High: `mark_read` allows cross-conversation updates without ownership checks
- Evidence: `apps/web/lib/socket.ts:316` calls `markAsRead(data.messageIds)` with no verification that those IDs belong to the authenticated user/conversation.
- Evidence: `apps/web/lib/data-access/chat.ts:158` updates by raw IDs only.
- Risk: A client can mark arbitrary messages as read if it obtains IDs.
- Improvement:
1. Restrict updates by both `messageIds` and expected conversation/sender constraints.
2. For employee caller: allow only messages where `employeeId = auth.id` and `sender = 'admin'`.
3. For admin caller: allow only messages where `employeeId = targetId` and `sender = 'employee'`.

### 2. High: Chat lock feature is partially implemented and effectively unused on client
- Evidence: server emits `conversation_locked` in `apps/web/lib/socket.ts:295`.
- Evidence: no listeners found for `conversation_locked` in web/mobile (`rg` only matches server emit).
- Evidence: docs claim lock acquisition on typing and send (`CHAT_FEATURE.md:52`), but server only locks on `send_message` (`apps/web/lib/socket.ts:289`).
- Risk: concurrent admin replies still happen in practice; behavior diverges from docs.
- Improvement:
1. Add admin client listener/state for `conversation_locked` and render lock ownership/expiry.
2. Decide whether lock should be acquired on typing; implement consistently or update docs.
3. Enforce lock at UI level (disable send when locked by another admin).

### 3. High: Mobile socket listener cleanup removes other subscribers globally
- Evidence: singleton socket in `apps/mobile/src/api/socket.ts:6`.
- Evidence: `apps/mobile/app/(tabs)/chat.tsx:215` uses `socketInstance.off('new_message')` and `off('messages_read')` without handler reference.
- Evidence: `apps/mobile/src/hooks/useChatUnread.ts:52` does the same.
- Risk: one screen/hook unmount can detach listeners owned by another screen/hook.
- Improvement:
1. Register named handler functions and call `off(event, sameHandler)`.
2. Consider a small event-bus wrapper over singleton socket to isolate subscriptions.

### 4. Medium: Admin chat socket effect can resubscribe repeatedly and clear others
- Evidence: `apps/web/hooks/use-admin-chat.ts:132` effect depends on `activeEmployeeId`, then attaches new handlers each time.
- Evidence: cleanup uses `socket.off('new_message')` etc without handler (`apps/web/hooks/use-admin-chat.ts:192`).
- Risk: accidental listener churn and possible interference if any other admin component subscribes to same events.
- Improvement:
1. Use stable callbacks (`useCallback`) and `off(event, handler)`.
2. Keep socket subscription effect dependency minimal (socket + stable handlers only).

### 5. Medium: Typing indicators may get stuck on admin side
- Evidence: typing map updates only from incoming `typing` events (`apps/web/hooks/use-admin-chat.ts:187`).
- Evidence: there is no local TTL fallback cleanup for stale `isTyping=true` states.
- Risk: dropped disconnect/offline events can leave conversations showing perpetual "typing...".
- Improvement:
1. Add per-employee client-side typing TTL (for example 3-5s auto-clear).
2. Optionally include server timestamp/sequence to reduce stale updates.

### 6. Medium: CORS is fully open for socket server
- Evidence: `origin: '*'` in `apps/web/lib/socket.ts:11`.
- Risk: broader attack surface and weaker origin controls for authenticated websocket usage.
- Improvement:
1. Restrict allowed origins by environment config.
2. Reject unexpected `Origin` explicitly in socket middleware.

### 7. Medium: API/test contract drift indicates weak chat test coverage
- Evidence: tests expect payloads like `data.messages` / `data.unreadCount` / `data.conversations` in `tests/e2e/chat/messages.spec.ts:140`, `tests/e2e/chat/messages.spec.ts:220`, `tests/e2e/chat/messages.spec.ts:245`.
- Evidence: current routes return direct arrays or `{ count }` (`apps/web/app/api/shared/chat/[employeeId]/route.ts:26`, `apps/web/app/api/shared/chat/unread/route.ts:26`, `apps/web/app/api/shared/chat/conversations/route.ts:15`).
- Risk: tests may be stale, false-positive, or not run against current behavior.
- Improvement:
1. Align response contracts and tests.
2. Add socket-level integration tests for `send_message`, `mark_read` authorization, lock behavior, and listener lifecycle.

### 8. Low: Admin attachments support is image-only, inconsistent with documented capability
- Evidence: admin file filter only accepts image MIME in `apps/web/hooks/use-admin-chat.ts:202`.
- Evidence: docs claim image/video support generally (`CHAT_FEATURE.md:14`, `CHAT_FEATURE.md:89`).
- Risk: inconsistent UX between admin and employee/mobile.
- Improvement:
1. Clarify product rule (image-only for admin vs parity).
2. If parity intended, allow videos in admin upload flow and preview renderer.

### 9. Low: Read-receipt batching in PWA can lose pending IDs on unmount
- Evidence: queued IDs in `pendingReadIds` with delayed flush (`apps/web/app/employee/(authenticated)/chat/page.tsx:64`, `apps/web/app/employee/(authenticated)/chat/page.tsx:74`).
- Evidence: cleanup clears timeout but does not flush pending set (`apps/web/app/employee/(authenticated)/chat/page.tsx:121`).
- Risk: some read receipts can be dropped when navigating away quickly.
- Improvement:
1. Flush pending read IDs in cleanup before clearing timeout if socket is connected.

## Quick Wins (Implementation Order)
1. Fix `mark_read` authorization constraints (Finding 1).
2. Fix socket listener subscription/cleanup patterns in mobile and admin hooks (Findings 3-4).
3. Implement and surface `conversation_locked` end-to-end or remove it from docs/UI expectations (Finding 2).
4. Add typing TTL fallback and tighten socket origin policy (Findings 5-6).
5. Reconcile tests/contracts and update `CHAT_FEATURE.md` to match current behavior (Finding 7).
