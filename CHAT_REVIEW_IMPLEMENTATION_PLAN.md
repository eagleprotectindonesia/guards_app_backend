# Chat Findings 1-6 Implementation Plan

## Scope
This plan covers Findings 1-6 from `CHAT_REVIEW_FINDINGS.md`:
1. `mark_read` authorization hardening
2. `conversation_locked` end-to-end completion
3. Mobile socket listener isolation/cleanup
4. Admin socket listener lifecycle cleanup
5. Typing indicator stale-state handling
6. Socket origin/CORS hardening

## Phase 1: Security + Correctness First

### Finding 1: Harden `mark_read` authorization

#### Goals
- Ensure only valid message IDs for the caller/conversation can be marked as read.
- Prevent cross-conversation/cross-user updates.

#### Backend changes
1. Add scoped data-access function in `apps/web/lib/data-access/chat.ts`:
- New function signature concept:
  - `markAsReadForEmployee(messageIds, employeeId)`
  - `markAsReadForAdmin(messageIds, employeeId)`
- Employee scope filter:
  - `id IN messageIds`
  - `employeeId = auth.id`
  - `sender = 'admin'`
  - `readAt IS NULL`
- Admin scope filter:
  - `id IN messageIds`
  - `employeeId = targetId`
  - `sender = 'employee'`
  - `readAt IS NULL`

2. Update socket handler in `apps/web/lib/socket.ts`:
- Replace raw `markAsRead(data.messageIds)` call with role-specific scoped function.
- Validate payload:
  - `messageIds` exists, array, non-empty
  - enforce max size (for example 100)
  - `targetId` required for admin path
- Emit `messages_read` only when `updatedCount > 0`.

3. Add structured error emissions in `apps/web/lib/socket.ts`:
- Invalid payload -> `socket.emit('error', { message: 'Invalid mark_read payload' })`
- Unauthorized target -> no-op + warn log

#### Tests
1. Add socket integration tests:
- Employee cannot mark messages belonging to another employee.
- Admin cannot mark messages outside provided employee conversation.
- Only sender-opposite messages are updated (`employee` marks `admin` messages, admin marks `employee` messages).

2. Add regression test for normal path:
- Valid IDs update and `messages_read` emits expected IDs.

#### Acceptance criteria
- Unauthorized IDs remain unread in DB.
- Valid IDs are updated and reflected in client events.

---

### Finding 6: Restrict socket CORS/origin

#### Goals
- Remove wildcard socket origin policy in production.

#### Backend changes
1. Update `apps/web/lib/socket.ts` server config:
- Replace `origin: '*'` with env-driven allowlist.
- Add helper (new file or inline): parse comma-separated origins from env.

2. Add explicit origin validation middleware:
- Reject handshake when origin not in allowlist (except local dev fallbacks).

3. Env/config updates:
- Add `SOCKET_ALLOWED_ORIGINS` to `.example-env` and deployment config.
- Keep local dev defaults for `http://localhost:*` and `https://localhost:*` as needed.

#### Tests
1. Add integration test for allowed origin success.
2. Add integration test for denied origin failure.

#### Acceptance criteria
- Known frontend origins connect successfully.
- Unknown origins are denied.

## Phase 2: Realtime Behavior Consistency

### Finding 2: Complete `conversation_locked` end-to-end

#### Goals
- Make lock state visible and enforceable in admin UI.
- Align implementation with product rule (lock on send vs typing+send).

#### Product decision (required)
- Decide lock acquisition trigger:
1. Send-only lock (simpler, lower noise)
2. Typing + send lock (closer to docs)

#### Backend changes
1. Keep current lock-on-send in `apps/web/lib/socket.ts` or extend to typing based on decision.
2. Add lock release/refresh semantics:
- Refresh expiry while same admin is active.
- Optional unlock event on send complete or inactivity timeout.

3. Add lock query/backfill for admin refresh:
- Optionally include lock metadata in conversation payload endpoint.

#### Frontend admin changes
1. In `apps/web/hooks/use-admin-chat.ts`:
- Subscribe to `conversation_locked` with named handler.
- Track lock state map `{ employeeId -> { lockedBy, expiresAt } }`.

2. In admin chat UI components:
- `apps/web/app/admin/(authenticated)/chat/client.tsx`
- `apps/web/app/admin/(authenticated)/components/floating-chat-widget.tsx`
- Show lock banner/status if locked by another admin.
- Disable send input/button when locked by other admin.

3. Optional: add lock countdown timer and stale cleanup.

#### Docs
- Update `CHAT_FEATURE.md` to match final behavior.

#### Tests
1. Two-admin scenario:
- Admin A locks conversation.
- Admin B receives lock event and cannot send.

2. Lock expiry scenario:
- After TTL, Admin B can send.

#### Acceptance criteria
- Admin clients consistently reflect lock state.
- Duplicate concurrent replies significantly reduced.

## Phase 3: Listener Lifecycle + UX Reliability

### Finding 3: Mobile listener cleanup isolation

#### Goals
- Prevent one component from removing listeners belonging to others.

#### Changes
1. In `apps/mobile/app/(tabs)/chat.tsx`:
- Define stable handler refs/functions for `new_message` and `messages_read`.
- Replace `off('event')` with `off('event', handler)`.

2. In `apps/mobile/src/hooks/useChatUnread.ts`:
- Same targeted unsubscribe pattern.

3. Optional refactor in `apps/mobile/src/api/socket.ts`:
- Add helper `subscribeSocket(event, handler)` that returns unsubscribe function.

#### Tests
- Mount unread hook + chat screen simultaneously, unmount one, verify other still receives events.

#### Acceptance criteria
- Unmounting one subscriber no longer breaks other subscribers.

---

### Finding 4: Admin web listener lifecycle cleanup

#### Goals
- Avoid resubscription churn and broad unsubscription in admin hook.

#### Changes
1. In `apps/web/hooks/use-admin-chat.ts`:
- Convert event handlers to stable callbacks.
- Subscribe once per socket lifecycle.
- Use targeted `off(event, handler)` cleanup.
- Avoid dependencies that force unnecessary re-attach cycles.

2. Add guard for stale closures:
- Use refs for mutable values (`activeEmployeeId`) where needed.

#### Tests
- Verify no duplicated handler invocation after repeated conversation switches.

#### Acceptance criteria
- One event results in one logical handler execution.
- No accidental listener removal for unrelated subscribers.

---

### Finding 5: Typing indicator stale-state fallback

#### Goals
- Prevent indefinitely stuck "typing..." indicators.

#### Changes
1. In `apps/web/hooks/use-admin-chat.ts`:
- For each incoming `isTyping=true`, set/reset a TTL timeout (3-5s) per employee.
- Auto-clear typing state when timeout expires.
- Clear timeout on explicit `isTyping=false`.

2. Optional backend enhancement in `apps/web/lib/socket.ts`:
- Include `timestamp` in typing payload for diagnostics.

#### Tests
- Simulate dropped `isTyping=false`; verify UI auto-clears.
- Verify rapid typing events extend TTL instead of flicker.

#### Acceptance criteria
- Typing indicator self-heals without requiring disconnect event.

## Cross-Cutting Tasks
1. Add lightweight socket event validation schemas (Zod) for `mark_read`, `send_message`, `typing` payloads.
2. Add structured logs for rejected socket payloads (no sensitive content).
3. Run `npm run lint` and chat-focused tests.

## Suggested Delivery Sequence
1. Finding 1 (security) + Finding 6 (origin policy)
2. Finding 3 + Finding 4 (listener lifecycle)
3. Finding 5 (typing TTL)
4. Finding 2 (lock UX + product alignment)
5. Documentation + tests cleanup

## Rollout and Verification
1. Deploy behind feature flags where useful:
- `CHAT_LOCK_UI_ENABLED`
- `SOCKET_ORIGIN_ENFORCEMENT_ENABLED` (if needed for staged rollout)

2. Monitor after deploy:
- Socket auth/connect error rate
- `mark_read` rejected payload count
- Duplicate admin reply incidence
- Client-side listener error logs

## Refactor Track (Structural Improvements)

### Why this track
Findings 1-6 address immediate risks. This refactor track reduces repeated logic, event drift, and lifecycle bugs that caused several of those findings.

### Refactor A: Chat domain service (server-side)

#### Target
- Introduce `apps/web/lib/chat-service/` with cohesive modules:
1. `authorization.ts` (who can act on which conversation/message)
2. `messages.ts` (save/fetch/read logic)
3. `locks.ts` (acquire/refresh/release lock)
4. `events.ts` (socket payload builders + event emit wrappers)

#### Migration
1. Move role/message authorization logic out of `apps/web/lib/socket.ts`.
2. Move scoped read receipt logic out of raw data-access calls.
3. Keep `apps/web/lib/data-access/chat.ts` focused on persistence primitives only.

#### Expected outcome
- Socket handlers become orchestration-only.
- API routes and socket handlers share one business logic source.

---

### Refactor B: Typed socket contracts in shared package

#### Target
- Add shared contracts (for example `packages/types/src/chat-events.ts`):
1. event name constants
2. client->server payload types
3. server->client payload types
4. optional runtime schemas (Zod)

#### Migration
1. Update backend `apps/web/lib/socket.ts` to use shared types.
2. Update admin web hooks/components to typed `socket.on/emit` wrappers.
3. Update mobile `apps/mobile/src/api/socket.ts` + chat hooks/screens.

#### Expected outcome
- Compile-time alignment across backend/web/mobile.
- Fewer mismatches like payload shape/field drift.

---

### Refactor C: Socket handler modularization

#### Target
- Split `apps/web/lib/socket.ts` into registrars:
1. `registerChatHandlers(io, socket)`
2. `registerAlertHandlers(io, socket)`
3. `registerDashboardHandlers(io, socket)`
4. `registerEmployeeStreamHandlers(io, socket)`

#### Migration
1. Keep `initSocket` as composition root only.
2. Extract each concern with no behavior changes first.
3. Add narrow tests per registrar.

#### Expected outcome
- Lower file complexity and safer iteration.

---

### Refactor D: Client socket subscription abstraction

#### Target
- Create reusable helper/hook for listener lifecycle symmetry:
1. Web: `apps/web/hooks/use-socket-event.ts`
2. Mobile: `apps/mobile/src/api/socket-subscribe.ts` (or hook equivalent)

#### Migration
1. Replace direct `on/off` usage in:
- `apps/web/hooks/use-admin-chat.ts`
- `apps/web/app/employee/(authenticated)/chat/page.tsx`
- `apps/web/app/employee/(authenticated)/components/bottom-nav.tsx`
- `apps/mobile/app/(tabs)/chat.tsx`
- `apps/mobile/src/hooks/useChatUnread.ts`

#### Expected outcome
- Eliminates class of bugs from `off('event')` broad unsubscribes.

---

### Refactor E: Admin chat state reducer/store

#### Target
- Refactor `apps/web/hooks/use-admin-chat.ts` into:
1. reducer (`chatReducer.ts`)
2. action creators/effects
3. thin hook wrapper for UI integration

#### Migration
1. Define canonical state shape (conversations, messagesByEmployee, typing, locks, uploads).
2. Convert side effects to explicit handlers.
3. Preserve external hook API to avoid broad UI rewrite.

#### Expected outcome
- Deterministic transitions and simpler testing.

## Refactor Delivery Plan (Recommended)
1. Refactor C first (lowest risk, structural extraction).
2. Refactor B second (typed contracts) while behavior is unchanged.
3. Refactor A third (move business rules into service layer).
4. Refactor D fourth (client lifecycle abstraction).
5. Refactor E last (admin state architecture).

## Refactor Effort (T-shirt sizing)
1. Refactor C: M
2. Refactor B: M
3. Refactor A: L
4. Refactor D: M
5. Refactor E: L

## Refactor Risks and Mitigations
1. Risk: behavior regression during extraction.
- Mitigation: do pure-move commits first, then behavior changes in separate commits.

2. Risk: event contract migration breaks one client.
- Mitigation: temporary compatibility adapter for old/new payloads during rollout.

3. Risk: test gaps in socket behavior.
- Mitigation: add socket integration tests before deep refactors, then lock expected behavior.

## Refactor Acceptance Criteria
1. `apps/web/lib/socket.ts` reduced to composition/orchestration with modular registrars.
2. Chat events and payloads compile from one shared contract module.
3. No direct broad unsubscription (`off('event')`) remains in chat clients.
4. Chat business rules live in service layer and are reused by both socket/API paths.
5. Admin chat state transitions covered by reducer-level tests.
