# Chat Socket Service Split Handover

This document is a handover brief for planning a migration of the chat realtime layer out of `apps/web` and into a separate Socket.IO service.

Use this doc as context when asking ChatGPT Web to propose an implementation plan.

---

## 1. Goal

We want to move Socket.IO out of the Next.js custom server so `apps/web` can run as a normal Next.js app again.

### Desired end state

- `apps/web` serves the Next.js app and API routes only.
- A separate realtime service owns Socket.IO connection handling, auth, room joins, and event broadcasting.
- The existing chat behavior remains functionally the same for:
  - admin dashboard chat
  - employee PWA chat
  - mobile app chat
  - read receipts
  - typing indicators
  - admin conversation locking
  - push-notification fallback when nobody is connected
- Redis stays the pub/sub backbone for scale.
- The chat database model and attachment upload flow stay intact unless a migration plan explicitly requires change.

### Why this is being considered

- The current Next.js app uses a custom Node server only to attach Socket.IO.
- That makes the web app less standard to deploy and maintain.
- A dedicated service would likely simplify the web app runtime and make realtime scaling and deployment more explicit.

---

## 2. Current Architecture Summary

### 2.1 Top-level system

The repo is a TurboRepo monorepo with:

- `apps/web`: Next.js app for admin and employee PWA
- `apps/mobile`: Expo/React Native app for guards
- `apps/worker`: background job runner
- `packages/database`: Prisma schema, DB client, seed scripts
- `packages/types`: shared TypeScript contracts, including socket event types
- `packages/shared` and `packages/validations`: shared logic and schemas

### 2.2 Current runtime shape

Right now, the web app is not using the default Next.js server model in production or dev.

`apps/web/server.ts` creates an HTTP server, initializes Next.js, and then attaches Socket.IO through `initSocket(server)`.

Important detail:

- `apps/web/package.json` uses `tsx server.ts` for `dev` and `start`
- `next dev` exists separately as `next-dev`, but it is not the main app entrypoint

### 2.3 Socket.IO bootstrap

Socket.IO is initialized in `apps/web/lib/socket.ts`.

Current responsibilities in that file:

- create Socket.IO server on top of the HTTP/HTTPS server
- configure CORS using `ALLOWED_ORIGINS`
- attach the Redis adapter using `@socket.io/redis-adapter`
- run the auth middleware
- register system handlers
- register admin, employee, and chat handlers on connection

### 2.4 Authentication

Socket auth currently lives in `apps/web/lib/socket-auth.ts`.

Current auth behavior:

- Web clients authenticate through HTTP-only cookies
- Mobile clients pass a token in the handshake auth payload
- Admin and employee sessions are validated server-side
- The authenticated identity is attached to `socket.data.auth`

Auth currently supports:

- `admin`
- `employee`

It also carries role-specific data:

- admin permissions
- employee session ID
- client type (`mobile` or `pwa`)

### 2.5 Chat behavior

The realtime layer supports:

- `send_message`
- `mark_read`
- `typing`
- `conversation_locked`
- read notification fanout
- push fallback when a recipient is offline

Rooms:

- `admin`
- `employee:${employeeId}`

Admin lock behavior:

- Redis key pattern: `chat_lock:${employeeId}`
- locks are refreshed on typing and send
- lock TTL is currently 120 seconds

### 2.6 Data and attachment flow

Chat messages are persisted in PostgreSQL via Prisma.

Key points:

- attachment messages reserve a draft `ChatMessage` row first
- attachments upload to S3 using the draft message ID
- the client later emits `send_message` to finalize the draft row
- `ChatMessage.status` has at least:
  - `draft`
  - `sent`
  - `expired`

`draft` and `expired` rows are hidden from normal history/unread/export flows.

### 2.7 Push notifications

When a chat recipient has no active socket connections, the backend falls back to push notifications.

This is documented in `docs/FIREBASE_NOTIFICATIONS.md` and is currently triggered from the chat realtime path.

That means the realtime service split must preserve:

- online presence detection
- push fallback behavior
- stale-token cleanup logic

---

## 3. Relevant Files

### Socket and server

- [`apps/web/server.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/server.ts)
- [`apps/web/lib/socket.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/lib/socket.ts)
- [`apps/web/lib/socket-auth.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/lib/socket-auth.ts)

### Chat feature docs

- [`docs/CHAT_FEATURE.md`](/home/tian/Documents/Work/guards_app_backend/docs/CHAT_FEATURE.md)
- [`docs/FIREBASE_NOTIFICATIONS.md`](/home/tian/Documents/Work/guards_app_backend/docs/FIREBASE_NOTIFICATIONS.md)

### Docker and runtime

- [`docker-compose.yml`](/home/tian/Documents/Work/guards_app_backend/docker-compose.yml)
- [`apps/web/package.json`](/home/tian/Documents/Work/guards_app_backend/apps/web/package.json)

### Client connection points

- [`apps/web/components/socket-provider.tsx`](/home/tian/Documents/Work/guards_app_backend/apps/web/components/socket-provider.tsx)
- [`apps/mobile/src/api/socket.ts`](/home/tian/Documents/Work/guards_app_backend/apps/mobile/src/api/socket.ts)
- [`tests/e2e/helpers/socket-client.ts`](/home/tian/Documents/Work/guards_app_backend/tests/e2e/helpers/socket-client.ts)

### Tests that exercise realtime behavior

- [`apps/web/tests/integration/chat-lock.test.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/tests/integration/chat-lock.test.ts)
- [`apps/web/tests/socket-cors.test.ts`](/home/tian/Documents/Work/guards_app_backend/apps/web/tests/socket-cors.test.ts)
- [`tests/e2e/realtime/socket-events.spec.ts`](/home/tian/Documents/Work/guards_app_backend/tests/e2e/realtime/socket-events.spec.ts)

---

## 4. Current Deployment Context

### docker-compose.yml

The current compose file defines:

- `app`
- `worker`
- `migration`
- `redis`

There is no dedicated socket service yet.

`app` currently exposes `127.0.0.1:3000:3000` and depends on Redis.

This means any split plan needs to decide:

1. whether the new socket service shares the app container image or uses a new image
2. whether it gets its own port and hostname
3. whether clients connect to it directly or through a reverse proxy
4. how the service is deployed alongside web, worker, and migration containers

### Current Next.js dev/start flow

`apps/web/package.json` currently wires:

- `dev`: `tsx server.ts`
- `start`: `NODE_ENV=production tsx server.ts`
- `dev:https`: `next dev --experimental-https`

This indicates the Socket.IO server is tightly coupled to the custom server entrypoint.

---

## 5. Important Behavioral Constraints

These are the things that should not regress in the split.

### Authentication and authorization

- Admins and employees must still authenticate correctly.
- Web clients still need cookie-based auth where applicable.
- Mobile clients still need token-based handshake auth.
- The socket service must still reject unauthorized connections.
- Role resolution must still work when both admin and employee cookies/tokens are present.

### Chat integrity

- message IDs must remain canonical
- draft attachment reservation must still work
- message finalization must remain idempotent enough to survive retries
- read receipts must still be scoped to the actual recipient
- chat locks must still prevent multiple admins from replying at once

### Scaling and consistency

- Redis pub/sub is already part of the design and should continue to be used
- multi-instance socket delivery must still work
- typing indicators should remain transient
- the UI currently expects connection status and room-based events to be reliable

### Push fallback

- if a user is offline, push notification fallback should still trigger
- push sending should not be duplicated by the new topology

### Client compatibility

Clients are currently written assuming the socket endpoint is available on the web app origin, with a relative path:

- web provider uses `io({ path: '/socket.io' })`
- mobile and E2E helpers use an explicit base URL

The split plan needs to address cross-origin connection, cookies, and CORS.

---

## 6. What ChatGPT Should Plan For

When asking ChatGPT Web to plan the migration, ask it to cover at least these areas:

### Architecture choices

- separate service process vs separate deployment vs shared package
- how the new service will expose the socket endpoint
- whether Next.js should remain on the same domain behind a reverse proxy
- whether `/socket.io` stays as the path or changes

### Auth redesign

- how the socket service will verify admin and employee sessions
- how it will access the existing auth/session code
- whether auth code should be extracted into a shared package
- how to handle cookie auth for browser clients when socket origin changes

### Event topology

- which events remain exactly the same
- whether event payloads need versioning or a compatibility layer
- whether the service should still register all current handlers in the same logical modules

### Infrastructure changes

- new Docker service definition
- new env vars
- new health checks
- new port assignment
- reverse proxy or ingress rules if needed
- Redis connection handling

### Client changes

- web socket provider updates
- mobile socket base URL updates
- E2E test URL updates
- any cookie / CORS / transport changes

### Testing strategy

- unit tests for auth and event handling
- integration tests for chat locks and CORS
- smoke tests for live socket connection
- e2e coverage for admin/employee chat flows

### Rollout strategy

- how to keep old and new systems running during the transition if needed
- whether a staged migration or feature flag is safer
- how to verify no downtime or broken chat during deployment

---

## 7. Existing Tests Worth Preserving

These tests show the current contract and should guide the split:

- `apps/web/tests/integration/chat-lock.test.ts`
- `apps/web/tests/socket-cors.test.ts`
- `tests/e2e/realtime/socket-events.spec.ts`

Notable expectations already encoded there:

- admin conversation lock enforcement
- Redis-backed lock refresh behavior
- socket CORS origin restrictions
- connection establishment from client helpers

If the socket service moves out, these tests should likely be adapted rather than removed.

---

## 8. Current Implementation Notes from the Codebase

### `apps/web/server.ts`

This is a custom server wrapper around Next.js.

It creates the HTTP server, passes requests to Next, then calls `initSocket(server)`.

That is the exact coupling point being removed.

### `apps/web/lib/socket.ts`

This is the central Socket.IO bootstrap.

It:

- constructs the Socket.IO server
- adds Redis adapter
- authenticates sockets
- registers all handlers

If we split the service, most of this file probably becomes the starting point for the new realtime service.

### `apps/web/components/socket-provider.tsx`

The browser provider currently assumes same-origin, same-path Socket.IO.

That assumption is one of the biggest migration risks.

### `apps/mobile/src/api/socket.ts`

Mobile already connects with a configurable base URL, which may make the transition easier than web.

### `tests/e2e/helpers/socket-client.ts`

The E2E helpers also already use a configurable base URL via `API_BASE_URL`.

### `docker-compose.yml`

The runtime currently has no explicit socket service, so adding one will require a new compose entry and likely new production deployment wiring too.

---

## 9. Likely Migration Risks

These are the main pitfalls to plan around:

1. Cookie auth across origins
2. CORS and transport configuration
3. Session verification duplication if auth code stays in `apps/web`
4. Realtime event regressions if handlers are moved piecemeal
5. Hardcoded `/socket.io` assumptions in web client code
6. Push-notification fallback duplication or omission
7. Redis adapter setup differences between the old and new runtime
8. Test environment changes for localhost URLs and ports

---

## 10. Suggested Planning Prompt for ChatGPT Web

You can paste the following prompt into ChatGPT Web:

> I have a TurboRepo monorepo for a guard scheduling app. The Next.js web app currently uses a custom Node server only to host Socket.IO. I want to split Socket.IO into a separate service so the web app can use a standard Next.js runtime again. Please produce a migration plan, not code.
>
> Important context:
> - Current custom server: `apps/web/server.ts`
> - Current Socket.IO bootstrap: `apps/web/lib/socket.ts`
> - Current socket auth: `apps/web/lib/socket-auth.ts`
> - Web socket provider currently connects with same-origin `/socket.io`
> - Mobile and E2E helpers already use configurable base URLs
> - Redis adapter is already used for Socket.IO scaling
> - Chat relies on events like `send_message`, `mark_read`, `typing`, and `conversation_locked`
> - Chat uses Redis locks for admin exclusivity and falls back to push notifications when the recipient is offline
> - Attachment messages use a draft ChatMessage reservation flow before upload and finalization
>
> Please include:
> 1. target architecture options and recommendation
> 2. changes needed in auth/session handling
> 3. infra changes for Docker/production
> 4. client changes for web, mobile, and tests
> 5. rollback/compatibility strategy
> 6. test plan and rollout checklist
> 7. risks and tradeoffs
>
> Assume we want to preserve current chat behavior and minimize downtime.

---

## 11. Short Version

If you only need the fastest summary for a planning discussion:

- the socket layer is currently embedded in `apps/web/server.ts`
- `apps/web/lib/socket.ts` owns auth, Redis adapter setup, and event registration
- clients expect the socket server on the app origin
- splitting this will require infra, auth, CORS, and client connection changes
- preserve chat locks, read receipts, drafts, and push fallback

