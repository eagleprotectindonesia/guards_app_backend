Overall: the direction is good and mostly matches the intended target, but I see a few deployment and architecture risks you should fix or verify before production.

## Verdict

The architecture is **mostly correct**:

```txt
apps/web       -> standard Next.js runtime
apps/realtime  -> standalone Socket.IO service
packages/realtime -> shared socket runtime
Nginx /socket.io -> realtime service
```

The key split is real: `apps/web/server.ts` is removed, `apps/web` now uses `next dev` / `next start`, and `apps/realtime` owns the HTTP server + `/health` + Socket.IO bootstrap.

Docker is also mostly in the right shape: the Dockerfile now has separate `app-runner`, `worker-runner`, `realtime-runner`, and `migration-runner` targets, and CI builds/pushes a separate `realtime-*` image.

But I would **not deploy production yet** without checking the issues below.

---

# Good architectural decisions

## 1. `apps/realtime` is thin, which is good

`apps/realtime/src/server.ts` only creates an HTTP server, handles `/health`, calls `initRealtimeSocket`, and listens on `REALTIME_PORT`. That is the right shape.

This keeps realtime logic in `packages/realtime`, not duplicated in the app.

## 2. `packages/realtime` owns the old socket runtime

`initRealtimeSocket` still does the important things:

```txt
Socket.IO server creation
ALLOWED_ORIGINS CORS
Redis adapter
optional system Redis subscribers
socket auth middleware
admin/employee/chat handler registration
```

That preserves the old runtime responsibilities in one place.

## 3. Browser client supports same-origin and explicit local socket URL

The web provider now uses:

```ts
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL?.trim() || undefined;
```

and still uses path `/socket.io` with `withCredentials: true`.

That is exactly what you want:

```txt
Production/staging:
  NEXT_PUBLIC_SOCKET_URL unset
  browser connects same-origin /socket.io

Local direct split:
  NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

## 4. Mobile and E2E also support separate socket URL

Mobile now supports `EXPO_PUBLIC_SOCKET_URL`, falling back to `BASE_URL`.

E2E helper supports `SOCKET_BASE_URL`, falling back to `API_BASE_URL`.

Good.

## 5. Shared auth/storage/notifications extraction is mostly right

`@repo/realtime` depends on `@repo/auth-server`, `@repo/storage`, `@repo/notifications`, and `@repo/database`.

The old S3 URL enrichment is now using `@repo/storage`, which removes the old `apps/web` coupling.

Push notification code moved to `@repo/notifications`, with realtime setting the unread-count provider before re-exporting notification helpers.

---

# Main issues / risks to fix

## 1. Production realtime host port is `3004`, not `3001`

In `docker-compose.yml`, production realtime maps:

```yaml
127.0.0.1:3004:3001
```

Staging maps:

```yaml
127.0.0.1:3003:3001
```

This is okay **only if your Nginx config uses those host ports**:

```txt
staging /socket.io -> 127.0.0.1:3003
prod    /socket.io -> 127.0.0.1:3004
```

Earlier plan assumed production `3001`. Your compose file uses `3004`. That is not wrong, but it is easy to misconfigure.

**Action:** document the actual ports and make Nginx match the compose file.

Recommended Nginx production route:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3004;
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
```

## 2. `apps/web` still depends on `@repo/realtime`

`apps/web/package.json` includes:

```json
"@repo/realtime": "workspace:*"
```

Architecturally, after the split, `apps/web` should not need `@repo/realtime` unless tests or some web runtime code still imports it. The production web app should only need `socket.io-client`, not the server runtime.

This is not necessarily fatal, but it weakens the separation and may bloat the web standalone trace if any import path pulls server-only code.

**Action:** search actual imports. If only tests import `@repo/realtime`, remove it from `apps/web` dependencies and keep test resolution via Jest/module config or move tests under `packages/realtime`.

## 3. Realtime package exposes many internal modules from `index.ts`

`packages/realtime/src/index.ts` exports socket auth, fcm, data-access, and all handlers.

This is convenient for tests, but architecturally too broad. The public runtime API should mostly be:

```ts
initRealtimeSocket;
initSocket; // compatibility alias if needed
```

Exporting handlers/data-access/auth makes other apps more likely to couple to realtime internals.

**Action:** not urgent, but I’d eventually narrow `@repo/realtime` public exports. For tests, either import internals through test-specific paths or move realtime tests into `packages/realtime`.

## 4. Jest tests import subpaths that package consumers cannot import normally

Tests import things like:

```ts
@repo/realtime/socket-auth
@repo/realtime/data-access/chat
@repo/realtime/fcm
```

and Jest maps `^@repo/realtime/(.*)$` to source files.

But `packages/realtime/package.json` does **not** define `"exports"` for these subpaths. It only has `main` and `types`.

This is okay for Jest because of `moduleNameMapper`, but it means real consumers should not rely on those subpaths.

**Action:** either:

- keep subpath imports test-only, or
- add proper package `exports` if you want subpaths to be officially supported.

Example:

```json
"exports": {
  ".": "./src/index.ts",
  "./socket-auth": "./src/socket-auth.ts",
  "./data-access/chat": "./src/data-access/chat.ts",
  "./fcm": "./src/fcm.ts"
}
```

I would prefer **not** exposing internals unless needed.

## 5. No graceful shutdown in realtime service

`registerSystemHandlers` returns a cleanup function that quits the Redis subscriber, but `initRealtimeSocket` does not capture/use it, and `apps/realtime/src/server.ts` does not handle `SIGTERM`.

For Docker deploys, this can cause rough shutdowns. Usually not catastrophic, but it is worth fixing for production.

**Action:** add graceful shutdown:

```ts
const io = initRealtimeSocket(...);

process.on('SIGTERM', async () => {
  io.close();
  server.close(() => process.exit(0));
});
```

Better: make `initRealtimeSocket` also return cleanup hooks for Redis pub/sub duplicates.

## 6. Redis adapter duplicate clients are not explicitly connected or error-handled

`initRealtimeSocket` does:

```ts
const pubClient = redis.duplicate({ enableOfflineQueue: true });
const subClient = redis.duplicate({ enableOfflineQueue: true });
io.adapter(createAdapter(pubClient, subClient));
```

This matches the old behavior, but production separation is a good time to harden it. At least add error handlers for pub/sub clients. If using ioredis, explicit `connect()` may not be required depending on lazy connection config, but error logging is important.

**Action:** add:

```ts
pubClient.on('error', ...)
subClient.on('error', ...)
```

and clean them up on shutdown.

## 7. `ALLOWED_ORIGINS='*'` fallback is risky with credentials

Socket.IO CORS still falls back to `'*'`.

For production, same-origin Nginx routing reduces risk, but since the web client now sends `withCredentials: true`, production should use explicit origins.

**Action:** ensure production/staging `.env` has explicit `ALLOWED_ORIGINS`, for example:

```env
ALLOWED_ORIGINS=https://crm.eagleprotect.id,https://staging.crm.eagleprotect.id
```

I would also consider failing fast in production if `ALLOWED_ORIGINS` is missing.

## 8. Build/deploy path is probably correct, but must be tested once in CI or locally

The Dockerfile uses:

```dockerfile
turbo prune --scope=realtime --docker
...
turbo run build --filter=realtime
...
pnpm --filter realtime --prod deploy --legacy /out/realtime-deploy
...
CMD ["node", "dist/server.js"]
```

This is coherent. The realtime app build bundles `src/server.ts` into `dist/server.js`, and the runtime image runs that file.

But because this relies on esbuild bundling workspace packages and leaving some dependencies external, you should verify it with a real image build.

**Action:** run:

```bash
docker build --target realtime-runner -t realtime-test .
docker run --rm --env-file .env -p 3001:3001 realtime-test
curl http://localhost:3001/health
```

Then test socket auth against the container.

## 9. Web standalone output is a major deployment change beyond socket split

The web runner changed from copying the full monorepo and running `pnpm --filter web start` to copying `.next/standalone` and running:

```dockerfile
CMD ["node", "apps/web/server.js"]
```

That is a good production optimization, and `next.config.ts` enables `output: 'standalone'`.

But this is a separate deployment risk from the socket split. You need to test that all runtime dependencies are traced correctly, especially Prisma, Redis, Firebase, S3, `xlsx`, and any dynamic imports.

**Action:** build and run the app image before deploying:

```bash
docker build --target app-runner -t app-test .
docker run --rm --env-file .env -p 3000:3000 app-test
curl http://localhost:3000/api/health
```

Then test login and attachment APIs.

## 10. The branch removed the old integration test workflow

The compare result shows `.github/workflows/integration-tests.yml` was removed. I did not inspect its contents because it is removed, but for a large infrastructure split this is concerning.

**Action:** make sure there is still some CI path that runs at least:

```txt
type-check
unit tests
integration smoke tests
Docker build for app
Docker build for realtime
```

Otherwise this branch could be deployable only “by faith.”

---

# Docker image review

## App image

Good:

- Uses Next standalone.
- No custom socket server.
- Healthcheck remains `/api/health`.
- Runs `node apps/web/server.js`.

Risk:

- Standalone tracing must include everything needed by API routes.
- `apps/web` still lists backend packages including `@repo/realtime`; remove if not needed.

## Realtime image

Good:

- Separate `realtime-runner`.
- Uses `REALTIME_PORT=3001`.
- Exposes `3001`.
- Healthcheck hits `/health`.
- Runs non-root `realtimeuser`.
- CI builds/pushes the target.

Risk:

- Needs real runtime test to confirm esbuild + `pnpm deploy` include all external deps.
- Needs graceful shutdown.
- Needs Redis adapter error handling.

## Compose

Good:

- Adds `realtime` to prod and staging.
- Realtime depends on Redis health.
- Deploy workflows now start `app worker realtime`.

Risk:

- Production host port is `3004`; staging is `3003`. Nginx must match.
- No compose-level healthcheck, but Dockerfile healthcheck is fine.

---

# Suggested fixes before staging

I would ask Codex for a small hardening pass:

```txt
Please review and harden the realtime split before staging.

Scope:
1. Add graceful shutdown to apps/realtime/src/server.ts.
2. Add error handlers and cleanup for Socket.IO Redis adapter pub/sub clients in packages/realtime.
3. Make initRealtimeSocket return enough cleanup information or close hooks.
4. Keep behavior and event contracts unchanged.
5. Do not change chat payloads, room names, or auth behavior.
6. Remove @repo/realtime from apps/web dependencies if no production web code imports it.
7. Add or update docs to explicitly say production Nginx should route /socket.io to 127.0.0.1:3004 and staging to 127.0.0.1:3003, matching docker-compose.
8. Verify package exports or avoid non-test subpath imports from @repo/realtime.
```

Then do:

```bash
docker build --target app-runner -t app-test .
docker build --target realtime-runner -t realtime-test .
```

and run both locally/SSH server-side before Nginx cutover.

---

# Final assessment

The split is architecturally sound. The biggest thing to watch is no longer “did Codex separate Socket.IO?” — it did. The real risks are now operational:

```txt
1. Nginx points to the wrong realtime host port.
2. Realtime image builds but misses a runtime dependency.
3. Web standalone image misses a runtime dependency.
4. Redis adapter/subscribers shut down roughly during deploy.
5. CI coverage was reduced by removing the integration workflow.
```

Fix or verify those before production, and the architecture should be solid.
