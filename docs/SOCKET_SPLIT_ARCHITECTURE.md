# Socket Split Architecture (Web -> Realtime Service)

This document summarizes the architectural changes made during the Socket.IO split.  
It is intentionally short and focused on system design, not implementation details.

## What Changed

- Socket runtime ownership moved out of `apps/web` into:
  - `packages/realtime` (shared socket runtime library)
  - `apps/realtime` (standalone Socket.IO service process)
- `apps/web` now runs as standard Next.js runtime (no custom `server.ts` socket bootstrap).
- `/socket.io` traffic is intended to be routed to `apps/realtime` in production.

## New Architecture

- `apps/web`
  - Next.js app for pages + API routes only.
  - Still serves browser client code that connects via `socket.io-client`.
- `packages/realtime`
  - Shared backend socket runtime:
    - socket bootstrap (`initRealtimeSocket`)
    - socket auth
    - chat/admin/employee/system handlers
    - Redis adapter + Redis subscriber bridge behavior
  - Reused by tests and runtime services.
- `apps/realtime`
  - Dedicated Node service for Socket.IO.
  - Starts HTTP server + `/health` endpoint.
  - Attaches runtime from `@repo/realtime`.
  - Runs on `REALTIME_PORT` (default `3001`).

## Runtime Topology (Target)

- Nginx/public origin:
  - `/` -> `apps/web`
  - `/socket.io` -> `apps/realtime`
- Redis:
  - Shared by web/worker/realtime ecosystem.
  - Realtime service owns socket pub/sub and system subscriber fan-out.

## Contract Preservation

The split keeps client-facing socket contracts stable:

- Same socket path (`/socket.io`)
- Same event names and payload shapes
- Same auth/cookie behavior for browser clients
- Same room semantics and Redis-backed broadcast patterns

Result: clients should not need protocol-level changes for the split itself.

## Operational Separation

- `apps/realtime` can be deployed/restarted independently from `apps/web`.
- `apps/web` no longer starts legacy socket subscribers.
- Health checks for realtime are explicit via `GET /health`.

