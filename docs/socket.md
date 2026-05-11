Below is the **multi-phase migration plan** I would give Codex. It is designed so each phase can be implemented and reviewed separately.

## Recommended target architecture

Use a new runnable service:

```txt
apps/web
  Standard Next.js app only
  Serves pages + API routes

apps/realtime
  Node.js Socket.IO service
  Owns socket auth, rooms, chat, admin realtime, employee realtime, Redis bridge, push fallback

Nginx
  /              -> apps/web:3000
  /socket.io/    -> apps/realtime:3001
```

Keep `/socket.io` on the **same public origin**. That is the safest option because the browser provider currently uses same-origin `io({ path: '/socket.io' })`, and auth cookies are HTTP-only cookies scoped to path `/`.   

The split should move **all realtime behavior**, not just chat: chat, dashboard realtime events, admin notifications, employee session revocation, employee shift updates, and Redis-to-Socket.IO bridge behavior. Those are currently spread across the socket handlers under `apps/web/lib/socket/*`.    

---

# Phase 0 — Baseline audit and safety switches

## Goal

Prepare for staged migration without changing runtime behavior yet.

## Codex task

Add explicit feature flags so the legacy embedded socket server can be disabled later without deleting it.

Suggested env flags:

```env
ENABLE_LEGACY_SOCKET_SERVER=true
ENABLE_REALTIME_SYSTEM_SUBSCRIBERS=true
REALTIME_PORT=3001
```

In `apps/web/server.ts`, keep the custom server, but guard this:

```ts
if (process.env.ENABLE_LEGACY_SOCKET_SERVER !== 'false') {
  initSocket(server);
}
```

## Why this matters

If the old web server and new realtime service both run system Redis subscribers at the same time, dashboard/admin events can be duplicated. `registerSystemHandlers` subscribes to Redis and emits to Socket.IO rooms.  During staging, only one realtime runtime should own those subscribers.

## Acceptance criteria

* Existing app still runs exactly as before with default env.
* Setting `ENABLE_LEGACY_SOCKET_SERVER=false` starts web without attaching Socket.IO.
* No client changes yet.
* Existing tests still pass or fail only for already-known stale tests.

---

# Phase 1 — Extract shared server utilities

## Goal

Remove the main `apps/web` coupling before creating the new service.

## Codex task

Create shared backend packages or modules for code currently imported through `apps/web` aliases.

Recommended packages:

```txt
packages/auth-server
packages/storage
packages/notifications
packages/realtime
```

### Move/extract auth

Move these concepts out of `apps/web/lib/auth/*`:

```txt
AUTH_COOKIES
AUTH_COOKIE_SECURE
getJwtSecret
verifySession
SessionResult
UserRole
```

Current `socket-auth.ts` depends directly on `verifySession`, `AUTH_COOKIES`, cookie parsing, and JWT decoding. 

After extraction:

```txt
apps/web/lib/auth/session.ts
  may re-export from @repo/auth-server during transition

apps/web/lib/socket-auth.ts
  should eventually disappear or re-export shared socket auth
```

### Move/extract S3 URL enrichment

`apps/web/lib/data-access/chat.ts` wraps database chat functions and enriches attachments with presigned S3 URLs. That logic imports `@/lib/s3`, so it cannot be cleanly reused from `apps/realtime`. 

Move reusable S3 functions into:

```txt
packages/storage/src/s3.ts
```

Then expose something like:

```ts
getCachedPresignedDownloadUrl()
getPresignedUploadUrl()
uploadFile()
```

Web APIs and realtime handlers should both import from `@repo/storage`.

### Move/extract Firebase push helpers

Move chat push notification logic out of `apps/web/lib/fcm.ts` into:

```txt
packages/notifications/src/fcm.ts
```

The chat realtime path currently calls `sendChatPushNotification` when the employee room has no active sockets.  The FCM helper also handles stale-token cleanup. 

## Acceptance criteria

* `apps/web` still works.
* No new realtime service yet.
* `apps/web/lib/data-access/chat.ts` either imports from shared packages or becomes a thin compatibility wrapper.
* No duplicated auth/session logic.
* No duplicated Firebase stale-token cleanup logic.

---

# Phase 2 — Extract realtime runtime into `packages/realtime`

## Goal

Make socket runtime reusable by both old web custom server and new realtime app.

## Codex task

Create:

```txt
packages/realtime/src/index.ts
packages/realtime/src/socket.ts
packages/realtime/src/socket-auth.ts
packages/realtime/src/handlers/chat.ts
packages/realtime/src/handlers/admin.ts
packages/realtime/src/handlers/employee.ts
packages/realtime/src/handlers/system.ts
```

Move logic from:

```txt
apps/web/lib/socket.ts
apps/web/lib/socket-auth.ts
apps/web/lib/socket/chat.ts
apps/web/lib/socket/admin.ts
apps/web/lib/socket/employee.ts
apps/web/lib/socket/system.ts
```

Current `initSocket(server)` creates Socket.IO, configures CORS, adds the Redis adapter, authenticates sockets, and registers handlers. That should become the shared realtime entrypoint. 

Suggested exported function:

```ts
export function initRealtimeSocket(server: HttpServer | HttpsServer, options?: {
  enableSystemSubscribers?: boolean;
})
```

In `apps/web/lib/socket.ts`, temporarily re-export:

```ts
export { initRealtimeSocket as initSocket } from '@repo/realtime';
```

## Preserve contracts

Do not rename events or change payload shapes. Current event contracts live in `packages/types/src/socket-events.ts`. 

Events to preserve:

```txt
send_message
mark_read
typing
conversation_locked
new_message
messages_read
alert
active_shifts
upcoming_shifts
dashboard:backfill
admin_notification_created
admin_notifications_backfill
admin_notifications_read
auth:force_logout
shift:updated
```

## Acceptance criteria

* Legacy web custom server still runs sockets through `@repo/realtime`.
* No behavior change for clients.
* Chat locking tests still target the same logical behavior.
* Type imports remain clean: `@repo/types`, `@repo/database`, `@repo/auth-server`, `@repo/storage`, `@repo/notifications`.

---

# Phase 3 — Create `apps/realtime`

## Goal

Add the standalone Socket.IO service, but do not cut traffic to it yet.

## Codex task

Create:

```txt
apps/realtime/package.json
apps/realtime/src/server.ts
apps/realtime/tsconfig.json
```

Suggested service behavior:

```txt
GET /health -> 200 OK
Socket.IO path -> /socket.io
Port -> process.env.REALTIME_PORT || 3001
```

`apps/realtime/src/server.ts` should:

1. create a plain HTTP server,
2. expose `/health`,
3. call `initRealtimeSocket(server, { enableSystemSubscribers })`,
4. listen on `REALTIME_PORT`.

Recommended scripts:

```json
{
  "dev": "tsx --watch src/server.ts",
  "build": "esbuild src/server.ts --bundle --platform=node --target=node22 --outfile=dist/server.js --external:@prisma/client --external:pg --external:@prisma/adapter-pg --external:ioredis --external:firebase-admin --external:dotenv",
  "start": "node dist/server.js",
  "type-check": "tsc --noEmit"
}
```

## Required env

The realtime service should receive:

```env
DATABASE_URL
REDIS_URL
JWT_SECRET
ALLOWED_ORIGINS
WEB_APP_URL
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET_NAME
FIREBASE_SERVICE_ACCOUNT_JSON
REALTIME_PORT=3001
ENABLE_REALTIME_SYSTEM_SUBSCRIBERS=true
```

## Acceptance criteria

* `pnpm --filter realtime dev` starts a socket service locally.
* `GET http://localhost:3001/health` works.
* A token-authenticated socket can connect directly to `http://localhost:3001`.
* Web app remains unchanged in production behavior.

---

# Phase 4 — Update local dev and client configuration

## Goal

Make clients able to target the split service without forcing cross-origin production behavior.

## Codex task

### Web client

Update `apps/web/components/socket-provider.tsx` to support optional explicit socket URL:

```ts
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;

const socketInstance = io(socketUrl, {
  path: '/socket.io',
  withCredentials: true,
  reconnectionAttempts: 5,
  auth: { role },
});
```

Production should leave `NEXT_PUBLIC_SOCKET_URL` unset so browser sockets remain same-origin through Nginx.

Local dev can use either:

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

or a local Nginx/dev proxy.

### Mobile

Mobile already uses `BASE_URL` for Socket.IO.  Keep default behavior, but optionally add:

```env
EXPO_PUBLIC_SOCKET_URL
```

Then use:

```ts
const socketUrl = process.env.EXPO_PUBLIC_SOCKET_URL || BASE_URL;
```

### E2E helper

Current helper uses:

```ts
const SOCKET_URL = process.env.API_BASE_URL || 'http://localhost:3000';
```



Change to:

```ts
const SOCKET_URL =
  process.env.SOCKET_BASE_URL ||
  process.env.API_BASE_URL ||
  'http://localhost:3000';
```

## Acceptance criteria

* Production web can still use same-origin `/socket.io`.
* Local web can target direct realtime port.
* Mobile can keep using existing API base URL when Nginx routes `/socket.io`.
* E2E can independently point sockets to web origin or realtime origin.

---

# Phase 5 — Docker, Turbo, and CI build support

## Goal

Build and deploy the realtime service as a first-class app.

## Codex task

### Update `turbo.json`

Add realtime build/type-check tasks similar to worker:

```txt
realtime#build
realtime#type-check
realtime#lint
```

The current Turbo config has build tasks for web and worker only. 

### Update Dockerfile

Current Dockerfile prunes/builds web and worker only. 

Add stages:

```txt
realtime-builder
realtime-deployer
realtime-runner
```

Use a runtime similar to worker-runner.

Expose:

```dockerfile
EXPOSE 3001
```

Add healthcheck:

```dockerfile
HEALTHCHECK CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1
```

### Update GitHub Actions

Current deploy workflows build and push app, worker, and migration images only.  

Add build/push for:

```txt
guards-backend:realtime-${IMAGE_TAG}
```

### Update compose files

Current compose has `app`, `worker`, `migration`, and `redis`, but no realtime service. 

Add:

```yaml
realtime:
  image: ${ECR_REGISTRY}/guards-backend:realtime-${IMAGE_TAG:-latest}
  container_name: ep_guard_realtime
  restart: unless-stopped
  env_file: .env
  ports:
    - '127.0.0.1:3001:3001'
  environment:
    - TZ=Asia/Makassar
    - REALTIME_PORT=3001
    - ENABLE_REALTIME_SYSTEM_SUBSCRIBERS=true
  depends_on:
    redis:
      condition: service_healthy
  networks:
    - app_network
```

For staging, use host port `3003` or another free local port, since staging web currently maps `127.0.0.1:3002:3000`. 

## Acceptance criteria

* CI builds app, worker, migration, and realtime images.
* Compose can run `app worker realtime redis`.
* Realtime healthcheck works.
* Realtime container has no dependency on Next.js runtime.

---

# Phase 6 — Nginx staging routing

## Goal

Route staging `/socket.io` to realtime service while web remains same-origin to the browser.

## Nginx target shape

For staging:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 75s;
    proxy_send_timeout 75s;
}

location / {
    proxy_pass http://127.0.0.1:3002;
}
```

For production later:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    ...
}

location / {
    proxy_pass http://127.0.0.1:3000;
}
```

## Important staging rule

When staging routes `/socket.io` to `apps/realtime`, set:

```env
ENABLE_LEGACY_SOCKET_SERVER=false
```

on the staging web app if the old custom server is still used. Otherwise both old and new runtimes can subscribe to Redis system channels.

## Acceptance criteria

* Browser connects to `https://staging-domain/socket.io`.
* Nginx forwards websocket upgrades correctly.
* Cookies are sent normally because public origin did not change.
* Realtime logs show successful admin and employee socket auth.

---

# Phase 7 — Testing migration

## Goal

Adapt tests around the new service without weakening the current contract.

## Codex task

### Preserve these tests conceptually

```txt
apps/web/tests/integration/chat-lock.test.ts
apps/web/tests/socket-cors.test.ts
tests/e2e/realtime/socket-events.spec.ts
```

The handover correctly identifies these as contract tests. Current chat-lock tests verify admin lock ownership and TTL refresh behavior. 

### Move socket unit/integration tests

Recommended new structure:

```txt
apps/realtime/tests/chat-lock.test.ts
apps/realtime/tests/socket-cors.test.ts
apps/realtime/tests/socket-auth.test.ts
apps/realtime/tests/push-fallback.test.ts
apps/realtime/tests/employee-stream.test.ts
```

### Add focused tests

1. **Socket auth**

   * admin cookie auth works
   * employee cookie auth works
   * mobile token auth works
   * invalid token rejects
   * explicit employee role wins when both cookies exist

2. **Chat**

   * employee send broadcasts to `admin` and own `employee:${id}`
   * admin send broadcasts to `employee:${id}` and `admin`
   * admin lock prevents another admin
   * same admin can refresh lock
   * max 4 attachments enforced
   * finalized draft message broadcasts canonical message ID

3. **Push fallback**

   * if `fetchSockets()` returns empty, FCM is called
   * if employee socket exists, FCM is not called
   * stale-token cleanup remains covered through notification helper tests

4. **Employee stream**

   * `session_revoked` emits `auth:force_logout`
   * `shift_updated` emits `shift:updated`

5. **Redis system bridge**

   * `alerts:site:*` emits `alert`
   * `dashboard:active-shifts` emits `active_shifts`
   * `dashboard:upcoming-shifts` emits `upcoming_shifts`
   * `admin-notifications:admin:*` emits `admin_notification_created`

### Note about existing E2E

`tests/e2e/realtime/socket-events.spec.ts` appears potentially stale: it emits `join_admin_room`, but current admin handler automatically joins admin rooms and does not define `join_admin_room`; it also publishes to Redis channel `admin`, while current system handler subscribes to `alerts:site:*`, `dashboard:active-shifts`, `dashboard:upcoming-shifts`, and `admin-notifications:admin:*`.  

So Codex should **adapt**, not blindly preserve, that E2E test.

## Acceptance criteria

* Realtime package tests pass.
* Existing web tests are either moved or replaced with equivalent realtime tests.
* E2E can run against:

  * legacy same-origin socket
  * new same-origin socket via Nginx
  * direct realtime socket URL

---

# Phase 8 — Staging rollout

## Goal

Prove the split in staging with realistic traffic.

## Steps

1. Deploy app, worker, migration, realtime images.
2. Run migrations as usual.
3. Start:

   ```txt
   app
   worker
   realtime
   redis
   ```
4. Set staging web env:

   ```env
   ENABLE_LEGACY_SOCKET_SERVER=false
   ```
5. Route staging Nginx:

   ```txt
   /socket.io -> realtime
   /          -> web
   ```
6. Run smoke tests:

   * admin login
   * employee PWA login
   * mobile login
   * admin sends chat to employee
   * employee sends chat to admin
   * read receipts
   * typing indicator
   * admin lock
   * force logout when employee logs in elsewhere
   * dashboard alerts
   * admin notifications
   * offline employee push fallback

## Rollback

Rollback staging by changing Nginx `/socket.io` back to web and setting:

```env
ENABLE_LEGACY_SOCKET_SERVER=true
```

Then restart app.

## Acceptance criteria

* No duplicate realtime events.
* No missing push notifications.
* No cookie auth failures.
* No CORS failures.
* Realtime service can be restarted independently without restarting web.

---

# Phase 9 — Production rollout

## Goal

Cut production `/socket.io` to the realtime service safely.

## Pre-deploy checklist

* Realtime image exists in ECR.
* Production compose includes realtime.
* Nginx config is ready but not yet switched.
* Production env has all realtime secrets.
* `ALLOWED_ORIGINS` includes production and staging origins.
* Healthcheck endpoint works on local host port.

## Deployment sequence

1. Deploy new images but keep production Nginx unchanged.
2. Start realtime service.
3. Verify:

   ```txt
   curl http://127.0.0.1:3001/health
   ```
4. Set production web:

   ```env
   ENABLE_LEGACY_SOCKET_SERVER=false
   ```
5. Switch Nginx:

   ```txt
   /socket.io -> 127.0.0.1:3001
   ```
6. Reload Nginx.
7. Watch logs:

   * realtime auth errors
   * Redis errors
   * FCM errors
   * socket disconnect spikes
   * duplicated admin notifications
   * duplicated chat messages

## Rollback

Immediate rollback:

1. Change Nginx `/socket.io` back to `127.0.0.1:3000`.
2. Set:

   ```env
   ENABLE_LEGACY_SOCKET_SERVER=true
   ```
3. Restart web app.
4. Stop realtime if duplicate events appear.

## Acceptance criteria

* Existing clients do not need a redeploy.
* Browser cookies continue working.
* Mobile keeps using the same public API URL.
* Chat and dashboard realtime behavior remains intact.

---

# Phase 10 — Convert web to standard Next.js runtime

## Goal

Remove the custom server from `apps/web`.

Only do this after staging and production realtime have been stable.

## Codex task

Update `apps/web/package.json`.

Current scripts use the custom server:

```json
"dev": "tsx server.ts",
"start": "NODE_ENV=production tsx server.ts"
```



Change to:

```json
"dev": "next dev",
"start": "next start"
```

Then either delete or archive:

```txt
apps/web/server.ts
apps/web/lib/socket.ts
apps/web/lib/socket-auth.ts
apps/web/lib/socket/*
```

Only delete after confirming no imports remain.

## Docker update

The app runner currently starts:

```dockerfile
CMD ["pnpm", "--filter", "web", "start"]
```



This can stay, because `web start` will now mean `next start`.

## Acceptance criteria

* `apps/web` runs with normal Next.js runtime.
* No Socket.IO dependency is required by `apps/web` unless the client still imports `socket.io-client`.
* Web deploy no longer starts Redis socket subscribers.
* Realtime deploy is independently restartable.

---

# Phase 11 — Cleanup and hardening

## Goal

Make the new architecture maintainable.

## Codex task

Add docs:

```txt
docs/REALTIME_SERVICE.md
docs/DEPLOYMENT_REALTIME.md
```

Update existing docs:

```txt
docs/CHAT_FEATURE.md
docs/FIREBASE_NOTIFICATIONS.md
```

`docs/CHAT_FEATURE.md` still describes the backend as a Next.js custom server with Socket.IO. 

## Add operational checks

* Realtime health endpoint
* Realtime startup log with:

  * Redis connected
  * Redis adapter attached
  * system subscribers enabled/disabled
  * allowed origins
* Graceful shutdown:

  * close HTTP server
  * close Socket.IO server
  * quit Redis duplicates/subscribers
* Metrics/log fields:

  * socket role
  * auth failure reason
  * connection count
  * push fallback attempted/skipped
  * Redis subscriber errors

## Acceptance criteria

* Future developers can understand why `/socket.io` is routed separately.
* Rollback procedure is documented.
* Local dev instructions include web + realtime + worker.

---

# Suggested Codex implementation prompts

Use one per phase.

## Prompt 1

```txt
Implement Phase 0 only.

Add feature flags around the legacy Socket.IO server in apps/web/server.ts.
Default behavior must remain unchanged.
Do not create apps/realtime yet.
Do not change client code.
Add minimal documentation/comments where useful.
Run type-checks if available.
```

## Prompt 2

```txt
Implement Phase 1 only.

Extract reusable backend auth/session constants and verifySession logic from apps/web into a shared package.
Then update apps/web imports to use the shared package or thin re-export wrappers.
Do not change runtime behavior.
Do not create apps/realtime yet.
Preserve cookie names and session verification behavior exactly.
```

## Prompt 3

```txt
Implement Phase 1 storage/notification extraction only.

Move reusable S3 helpers and Firebase chat push notification helpers out of apps/web into shared packages.
Update apps/web imports.
Do not change behavior, payloads, env var names, or stale-token cleanup.
```

## Prompt 4

```txt
Implement Phase 2 only.

Create packages/realtime and move the existing Socket.IO bootstrap and handlers into it.
apps/web/lib/socket.ts should become a compatibility wrapper around @repo/realtime.
Preserve all event names, room names, Redis key names, auth behavior, push fallback behavior, and chat lock TTL.
Do not create apps/realtime yet.
```

## Prompt 5

```txt
Implement Phase 3 only.

Create apps/realtime as a standalone Node Socket.IO service using @repo/realtime.
Add /health endpoint.
Use REALTIME_PORT defaulting to 3001.
Add package scripts for dev, build, start, and type-check.
Do not change Docker, Nginx, or web scripts yet.
```

## Prompt 6

```txt
Implement Phase 4 only.

Update web, mobile, and E2E socket clients to support optional dedicated socket URLs while preserving current defaults.
Production web should still work with same-origin /socket.io when no socket URL env var is provided.
Add SOCKET_BASE_URL support to E2E socket helper.
```

## Prompt 7

```txt
Implement Phase 5 only.

Update turbo.json, Dockerfile, GitHub Actions deploy workflows, docker-compose.yml, and docker-compose.staging.yml to build and run the realtime service.
Do not change Nginx config because it is server-local and not in this repo.
Keep app, worker, migration behavior unchanged.
```

## Prompt 8

```txt
Implement Phase 7 test migration only.

Move or adapt socket tests so they target @repo/realtime/apps/realtime instead of apps/web internals.
Preserve coverage for auth, CORS, chat locking, push fallback, employee stream events, and Redis system bridge.
Fix stale assumptions in existing realtime E2E tests if they no longer match current handlers.
```

## Prompt 9

```txt
Implement Phase 10 only.

After the realtime service is fully deployed, convert apps/web to standard Next.js runtime.
Change web dev/start scripts to next dev and next start.
Remove the legacy custom server and old socket wrapper files only if no imports remain.
Do not alter client socket behavior.
```

My main recommendation: **do not start by creating `apps/realtime` directly**. First extract shared auth/storage/notification/realtime code. Otherwise Codex will likely copy web-only code into the new service, creating duplicated session logic and future drift.
