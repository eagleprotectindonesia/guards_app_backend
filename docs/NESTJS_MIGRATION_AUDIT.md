# NestJS Migration — Audit & Plan

> Generated 2026-06-21. Updated after third-party review (2026-06-21).
> Phase 0 is ready to execute on `go`.

---

## 1. Executive Summary

Migrate the entire backend (~8300 LOC API routes, 8 BullMQ workers, Socket.io runtime) from vanilla TypeScript/Next.js to **NestJS 11 on Fastify**. The UI (`apps/web`) stays Next.js 16 App Router but the backend API becomes a first-class NestJS application.

**Key constraint:** Zero breaking changes to public API contracts (mobile app, external API, socket event names/payloads).

**Timeline:** ~22–24 weeks (single engineer) through Phase 6a (backend API complete). Server Component migration deferred to a separate follow-on milestone.

---

## 2. Current Architecture

### 2.1 Repo topology

```
ep-guard-scheduling/                        # TurboRepo monorepo (pnpm 10.32.1, turbo ^2.9.14)
├── apps/
│   ├── web/                                # Next.js 16 App Router (UI + 83 API route.ts + custom server.ts)
│   │   ├── app/api/                        # 83 route.ts files, ~6982 LOC
│   │   ├── lib/auth/                       # permissions.ts (194), 2fa.ts, session-helper.ts, admin-visibility.ts, leave-ownership.ts, has-permission.ts
│   │   ├── lib/admin-auth.ts               # 165 LOC — getAdminAuthSession, requirePermission, hasPermission
│   │   ├── lib/employee-auth.ts            # 83 LOC — getAuthenticatedEmployee, verifyEmployeeSession
│   │   ├── proxy.ts                        # 174 LOC — middleware-level auth (cookies + API key)
│   │   └── server.ts                       # 73 LOC — custom Node server, mounts Socket.io via @repo/realtime
│   ├── worker/                             # BullMQ background process, no HTTP
│   │   └── src/worker.ts                   # 186 LOC — 8 plain-class processors, 7 repeatable jobs
│   ├── realtime/                           # Standalone Socket.io on port 3001 (mapped 3004 in prod)
│   │   └── src/server.ts                   # 79 LOC entry, calls initRealtimeSocket
│   └── mobile/                             # Expo/React Native (client only — out of scope)
├── packages/
│   ├── database/                           # Prisma 7 + ioredis + BullMQ + AWS SDK (S3, SES)
│   │   └── src/repositories/               # 42 pure-function repository files
│   ├── auth-server/                        # verifySession(), JWT creation, RBAC (248 LOC session.ts)
│   ├── notifications/                      # Firebase FCM push (chat, leave, ticket)
│   ├── storage/                            # S3 presigned URLs
│   ├── realtime/                           # Shared Socket.io library (11 files: socket.ts, socket-auth.ts, 4 handlers, 2 data-access, fcm)
│   ├── server-shared/                      # EMPTY SHELL — src/ dir exists but no package.json, no code
│   ├── shared/                             # calculateCheckInWindow, cn(), locales (id/en), office-config
│   ├── types/                              # Pure TS types (socket-events, domain models)
│   ├── tsconfig/                           # base.json (shared TS config)
│   └── validations/                        # Zod 4 schemas (~40) + libphonenumber
└── tests/e2e/                              # 6 Playwright specs (experimental, deprioritized)
```

### 2.2 Three backend runtimes

| Process | Port | Tech | Role | NestJS usage |
|---|---|---|---|---|
| **web** (legacy API) | 3000 | Next.js 16 + custom server.ts | Admin/Employee UI + 83 REST API routes + embedded Socket.io | **None** |
| **worker** | — | Node + BullMQ + ioredis | Shift monitoring (5s tick), cleanup (1h), reminders (5m), photo reports (5m), sync (daily) | **None** |
| **realtime** | 3001/3004 | Socket.io + redis-adapter | Redis pub/sub bridge, room fanout, chat, dashboard broadcasts | **None** |

### 2.3 Authentication model

- **Middleware**: `apps/web/proxy.ts` checks HTTP-only cookies (`AUTH_COOKIES.ADMIN` / `.EMPLOYEE`) or `X-API-KEY` header for `/api/external/*`
- **Core**: `@repo/auth-server/src/session.ts:verifySession()` validates JWT → reads Redis cache (`admin:token_version:{id}`, `admin:permissions:{id}`) → falls back to Prisma
- **Socket auth**: `@repo/realtime/src/socket-auth.ts` parses cookies or `handshake.auth.token`, calls same `verifySession`
- **RBAC**: 34 permission resources × up to 4 actions defined in `apps/web/lib/auth/permissions.ts`; `rolePolicySchema` from `@repo/validations` defines access scopes (department/office)

### 2.4 Infrastructure

```
Dockerfile: 4 multi-stage images
  - app-runner (Next.js standalone, port 3000)
  - worker-runner (node dist/worker.js)
  - realtime-runner (node dist/server.js, port 3001 → mapped 3004)
  - migration-runner (prisma migrate deploy)

docker-compose.yml: 5 services (app, worker, realtime, migration, redis)
```

### 2.5 Test inventory

| Location | Count | Framework |
|---|---|---|
| `apps/web/tests/` | 54 unit | Jest + ts-jest |
| `apps/web/tests/integration/` | 7 integration | Jest |
| `apps/worker/src/processors/` | 2 unit | Jest |
| `tests/e2e/` | 6 Playwright (experimental) | Playwright |

---

## 3. NestJS Target Architecture

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ apps/web (Next.js 16) — UI + BFF via NestJS                                     │
│ ├── app/ (pages, client components, Server Components)                           │
│ │   ├── admin/(authenticated)/**         ← NOT migrated (keep @repo/database)    │
│ │   │    └── page.tsx, actions.ts (117 files total, deferred to Phase 6b)       │
│ │   └── employee/**                       ← calls NestJS /api/employee/*        │
│ ├── components/                                                                   │
│ ├── lib/                                                                           │
│ ├── NO api/ directory (moved to NestJS)                                           │
│ ├── NO proxy.ts (auth moved to NestJS Guards)                                    │
│ └── NO server.ts socket bootstrap (set ENABLE_WEB_EMBEDDED_SOCKET=false)         │
└─────────────────────┬────────────────────────────────────────────────────────────┘
        HTTP /api/* (Fastify) on :3002
        Strangler mechanism: NESTJS_API_URL env var in proxy.ts
        Prod: nginx routes /api/* → NestJS, / → Next.js
                      ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ apps/api-nest (NestJS 11, Fastify) — Port :3002 (internal)                     │
│ ├── main.ts                   — bootstrap via NestFactory.create                │
│ ├── src/                                                                          │
│ │   ├── controllers/           — replicates all 83 route.ts signatures           │
│ │   ├── services/              — wraps @repo/database repository functions        │
│ │   ├── auth/                  — JwtStrategy, ApiKeyGuard, PermissionsGuard       │
│ │   ├── common/                — ZodValidationPipe, HttpExceptionFilter          │
│ │   └── modules/               — per-domain feature modules                       │
│ └── Swagger: /api/docs, /api/external/v1/openapi.json                           │
├────────────────────────────────────────────────────────────────────────────────┤
│ apps/worker-nest (NestJS StandaloneApplication, no HTTP)                        │
│ ├── main.ts                   — NestFactory.createApplicationContext             │
│ └── src/                                                                          │
│     ├── processors/            — @Processor('scheduling'), @Processor('email'), ..│
│     └── services/              — ShiftMonitoringService, EmailService, ...        │
├────────────────────────────────────────────────────────────────────────────────┤
│ apps/realtime-nest (NestJS WebSocket Gateway on Socket.io) — Port :3001          │
│ ├── main.ts                   — bootstrap HTTP + Socket.io                        │
│ └── src/                                                                          │
│     ├── gateways/              — @WebSocketGateway: ChatGateway, AdminGateway, .. │
│     └── services/              — SystemSubscribersService (Redis pub/sub bridge)  │
├────────────────────────────────────────────────────────────────────────────────┤
│ packages/server-shared (shared Nest module library)                               │
│ ├── database/      PrismaService + RedisService (wraps @repo/database)            │
│ ├── auth/          JwtStrategy (wraps verifySession), Guards, Decorators          │
│ ├── config/        Typed ConfigModule (Zod-validated env schema)                  │
│ ├── bullmq/        QueueModule (@nestjs/bullmq shared config)                     │
│ ├── common/        ZodValidationPipe, HttpExceptionFilter, PaginationDto          │
│ └── health/        Terminus health indicators (Prisma, Redis)                     │
├────────────────────────────────────────────────────────────────────────────────┤
│ packages/* (unchanged)                                                            │
│ database, auth-server, notifications, storage, shared, types, validations         │
│ → server-shared services consume these as-is (no rewriting).                      │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Key technical decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo shape | **3 independent NestJS apps, sharing source code via `@repo/server-shared`** | NOT a single nest-cli monorepo. Each app has its own `nest-cli.json` but depends on the same module library. |
| Web role | **Next.js 16 UI; NestJS BFF for `/api/*`** | 83 Server Components keep direct Prisma access; only `route.ts` files migrate. |
| API contract | **Zero breaking changes** | 83 routes keep exact paths, methods, shapes. |
| HTTP platform | **Fastify** | 2–3× throughput; 83 routes + 5s scheduling tick benefit. |
| Strangler mechanism (dev) | **Env switch** — `proxy.ts` reads `NESTJS_API_URL`; if set, forwards `/api/*` to NestJS; if not, handles in-process as today. | No nginx in dev. Clean cutover via env var. Rollback = unset var. |
| Strangler mechanism (prod) | **nginx** — nginx `location /api/*` → `api-nest` upstream; `/` → `web` upstream. | Already have nginx in prod architecture. |
| Socket cutover | **nginx `/socket.io/*`** flips from `realtime` (legacy) to `realtime-nest` upstream. | Matches existing split-architecture docs. |
| Auth | **passport-jwt + `verifySession` wrapper** | Reuse existing JWT logic; cookie + Bearer unchanged. |
| Queue | **`@nestjs/bullmq`** — native NestJS decorators + integration | No custom registrar needed. |
| Phase 6 scope | **6a only (API routes)** | 117 admin Server Components keep `@repo/database`; deferred to 6b. |
| Legacy socket flag | **`ENABLE_WEB_EMBEDDED_SOCKET`** (web → `true`/`false`) + existing `ENABLE_REALTIME_SYSTEM_SUBSCRIBERS` (realtime). Documented state matrix §4 Phase 4. | Avoids double-emit. |
| Legacy dirs | **Delete empty route.ts dirs by explicit name** in Phase 7. | |

### 3.2 DI convention: repositories are not injectable

**Rule:** NestJS `@Injectable()` services may inject only Nest providers (`PrismaService`, `RedisService`, `ConfigService`). Repository functions from `@repo/database` are **statically imported** — they are not wrapped in DI. This preserves all 61 existing Jest unit tests that `jest.mock('@repo/database/...')` and avoids rewriting 42 repository files.

Tradeoff accepted: Nest integration tests cannot swap repository implementations via DI; they use Jest module mocking as today.

### 3.3 Auth extraction contract (must match `proxy.ts` behavior exactly)

| Auth method | Source | Cookie name | Strategy | Guard |
|---|---|---|---|---|
| Admin session | HTTP-only cookie | `AUTH_COOKIES.ADMIN` (= `'admin_token'`) | passport-jwt | `JwtAuthGuard` |
| Employee session | HTTP-only cookie *or* `Authorization: Bearer <token>` | `AUTH_COOKIES.EMPLOYEE` (= `'employee_token'`) | passport-jwt | `JwtAuthGuard` |
| External API | HTTP header | `X-API-KEY` | Custom | `ApiKeyGuard` |

Cookie constants are defined in `packages/auth-server/src/constants.ts`. Phase 1 must reuse them by exact name, not duplicate them.

### 3.4 Module tree (shared → features)

```
@repo/server-shared
├── DatabaseModule (@Global)    → provides PrismaClient + Redis
├── ConfigModule                → typed, Zod-validated environment
├── AuthModule                  → JwtStrategy, JwtAuthGuard, ApiKeyGuard, PermissionsGuard
│                                + decorators @CurrentUser, @Roles, @Permissions
├── BullMqModule                → @nestjs/bullmq root Queue
├── CommonModule                → ZodValidationPipe, HttpExceptionFilter
└── HealthModule                → Terminus (Prisma, Redis)

apps/api-nest imports server-shared + 11 feature modules:
├── AuthModule (configured)
├── AdminModule         (admin/* routes)
├── EmployeeModule      (employee/* + my/* + shifts/*)
├── ShiftsModule        (shift CRUD, check-in, attendance, heartbeat)
├── AlertsModule        (alert CRUD + resolve + report)
├── ChatModule          (direct + group chat REST)
├── TicketsModule       (ticket workflow)
├── LeaveModule         (leave request workflow)
├── OfficeAttendanceModule
├── SitesModule
├── ExternalApiModule   (v1/* — external facing, uses ApiKeyGuard)
├── ExportModule        (XLSX exports for admin)
└── PanicModule         (webhooks/panic)

apps/worker-nest imports server-shared + 8 processors:
├── SchedulingModule            (@Processor scheduling, 5s tick)
├── MaintenanceModule           (@Processor maintenance, 1h cleanup)
├── OfficeAbsenceFinalizeModule (@Processor office-absence-finalize)
├── EmployeeStatusModule        (@Processor employee-status, daily)
├── EmployeeSyncModule          (@Processor employee-sync, daily)
├── EmailModule                 (@Processor email, SES)
├── ShiftReminderModule         (@Processor shift-reminder, 5m)
└── ShiftPhotoReportModule      (@Processor shift-photo-report, 5m)

apps/realtime-nest imports server-shared + gateways:
├── ChatGateway                 (send_message, group_send_message, typing, mark_read)
├── AdminGateway                (subscribe_site, request_dashboard_backfill, notifications)
├── EmployeeGateway             (subscribe_ticket, auth:force_logout, shift:updated)
└── SystemSubscribersService    (Redis → Socket.io bridge, OnModuleInit)
```

---

## 4. Migration Phases

### Phase 0 — Foundations (1.5 weeks)

**Goal:** `packages/server-shared` skeleton that compiles + tests + `packages/tsconfig/nest.json` + all `@nestjs/*` deps installed. No behavior change.

#### Files to create

```
packages/tsconfig/nest.json                          ← NEW (decorators + types)
packages/server-shared/
  package.json
  tsconfig.json                                       ← extends @repo/tsconfig/nest.json
  nest-cli.json                                       ← project-type:library
  src/
    index.ts                                          ← barrel export
    database/
      database.module.ts                              ← @Global()
      prisma.service.ts                               ← wraps @repo/database db
      prisma.service.spec.ts                          ← smoke: injectable via Test
    redis/
      redis.module.ts                                 ← @Global()
      redis.service.ts                                ← wraps @repo/database/redis redis
    config/
      configuration.ts                                ← Zod schema for env vars
      config.module.ts                                ← @nestjs/config with dotenv
    common/
      zod-validation.pipe.ts                          ← skeleton (Phase 1 fleshes out)
```

#### Files to modify

- `turbo.json` — add tasks for `@repo/server-shared#build`, `#lint`, `#type-check`; wire dependsOn
- `jest.config.js` — add `moduleNameMapper` for `@repo/server-shared` → `<rootDir>/packages/server-shared/src`
- Root `package.json` — add all NestJS runtime + dev deps (see below)
- `AGENTS.md` — add reference to this migration doc

#### Dependencies

```bash
# Root devDependencies
pnpm add -Dw @nestjs/cli@^11 @nestjs/schematics@^11 \
  @nestjs/common@^11 @nestjs/core@^11 @nestjs/config@^4 \
  @nestjs/platform-fastify@^11 fastify@^5 @fastify/cookie@^11 @fastify/cors@^11 \
  @nestjs/passport@^11 passport@^0.7 passport-jwt@^4 \
  @nestjs/swagger@^11 @nestjs/terminus@^11 \
  @nestjs/websockets@^11 @nestjs/platform-socket.io@^11 \
  @nestjs/bullmq@^11 reflect-metadata@^0.2 rxjs@^7

# packages/server-shared runtime
pnpm --filter @repo/server-shared add @nestjs/common @nestjs/core @nestjs/config \
  @passport/passport passport-jwt @nestjs/bullmq bullmq \
  @repo/database @repo/validations @repo/types reflect-metadata rxjs

# packages/server-shared devDeps
pnpm --filter @repo/server-shared add -D @nestjs/testing @nestjs/cli \
  @repo/tsconfig @repo/eslint-config typescript ts-jest jest
```

#### Verification

- [ ] `pnpm install` green
- [ ] `pnpm turbo run type-check --filter=@repo/server-shared` green
- [ ] `pnpm turbo run lint --filter=@repo/server-shared` green
- [ ] `PrismaService` + `RedisService` both injectable via `Test.createTestingModule`
- [ ] `pnpm turbo run build --filter=@repo/server-shared` produces `dist/`
- [ ] `pnpm dev` (web + worker) still unchanged — **no behavior change**

**Not doing:** No `apps/api-nest` yet. No auth. No route changes. No nginx.

---

### Phase 1 — Auth + Health (2 weeks)

**Deliverable:** AuthModule ready, `/api/health` served from NestJS, strangler env switch operational.

**Dev script:** `pnpm dev` → `turbo run dev --filter=web --filter=worker --filter=api-nest`

#### Create

- `packages/server-shared/src/auth/`
  - `jwt.strategy.ts` — wraps `verifySession`, reads cookies by `AUTH_COOKIES.*` names
  - `jwt-auth.guard.ts` — REST auth guard
  - `api-key.guard.ts` — validates `X-API-KEY` via `@repo/database`
  - `permissions.guard.ts` — RBAC from `apps/web/lib/auth/permissions.ts`
  - `current-user.decorator.ts`
  - `auth.module.ts`
- `packages/server-shared/src/common/http-exception.filter.ts`
- `packages/server-shared/src/health/` — `@nestjs/terminus` indicators
- `apps/api-nest/`
  - `package.json`, `tsconfig.json` (extends `@repo/tsconfig/nest.json`)
  - `nest-cli.json` (project-type: application)
  - `src/main.ts` — `NestFactory.create(AppModule)`, Fastify, port `:3002`
  - `src/app.module.ts` — imports `AuthModule` + `HealthModule` + `ConfigModule`
  - `src/controllers/health.controller.ts` — `GET /api/health`

#### Infrastructure change

- `apps/web/proxy.ts` — read `process.env.NESTJS_API_URL`; if set, forward `/api/admin/*`, `/api/employee/*`, `/api/shared/*`, `/api/external/*` to NestJS. If not set, behave as today.
- nginx `/healthz` (nginx-level) separate from app `/api/health`; update `Dockerfile` HEALTHCHECK to use nginx `/healthz`.
- `ENABLE_WEB_EMBEDDED_SOCKET=true` (default) — web still mounts socket.
- api-nest on `:3002` (internal). Legacy processes unchanged.

#### Exit criteria

- [ ] Admin login → cookie accepted by NestJS JwtAuthGuard → `GET /api/admin/*` works
- [ ] `GET /api/external/v1/*` with `X-API-KEY` → ApiKeyGuard returns 200
- [ ] `proxy.ts` `NESTJS_API_URL` env switch works: unset → legacy; set → NestJS
- [ ] `GET /api/health` returns 200 from NestJS (Prisma + Redis indicators)
- [ ] `pnpm dev` starts web + worker + api-nest; all 3 process logs visible
- [ ] Existing Jest tests still pass (`jest.mock` unaffected)

---

### Phase 2 — Vertical Slice: External API (1.5 weeks)

**Deliverable:** All 7 `GET /api/external/v1/*` routes served exclusively from NestJS.

#### OpenAPI freeze (before cutover)

1. Snapshot current `apps/web/app/api/external/v1/openapi.json/route.ts` output to `tests/contracts/external-api.snapshot.json`.
2. Write `apps/api-nest/src/tests/external-api-contract.spec.ts`:
   - Boot `ExternalApiModule`
   - Call `SwaggerModule.createDocument()` with the same config
   - Normalize both JSON outputs (sort keys, canonicalize `$ref` naming)
   - `expect(normalizedNest).toEqual(normalizedSnapshot)`
3. Gate Phase 2 exit on this test passing. Any diff = explicit contract break decision.

#### Create

- `ExternalApiModule`, controllers for all 7 external routes
- `ApiKeyGuard` enabled on the module

#### Exit criteria

- [ ] OpenAPI contract test passes
- [ ] `GET /api/external/v1/attendance`, `/check-ins`, `/shifts`, etc. all return identical JSON as before
- [ ] `proxy.ts` forwards `/api/external/v1/*` to NestJS when `NESTJS_API_URL` is set

---

### Phase 3 — Domain Migrations (8–10 weeks, sequential)

11 domains, one at a time:

1. **Admin auth** — login, 2FA, logout
2. **Employee auth** — login, biometric, change-password
3. **Sites, ShiftTypes, Admins, Employees** (read CRUD)
4. **Shifts, attendance, checkins** — read `docs/GUARD_CHECKIN_ALERTING.md` first
5. **Alerts, heartbeat** — alerting hot path (time-sensitive)
6. **Office attendance**
7. **Tickets**
8. **Leave requests**
9. **Chat REST** (direct + group)
10. **Holidays, memos, settings, audit logs, exports**
11. **Panic webhook + external grouped endpoints**

Each domain PR includes:
- NestJS controller + service + DTO (Zod via `@repo/validations`)
- `apps/web/proxy.ts` updated to forward the domain's `/api/*` paths when `NESTJS_API_URL` is set
- All existing Jest unit tests in `apps/web/tests/` for that domain still pass (`jest.mock('@repo/database')` unaffected)
- Integration test in `apps/web/tests/integration/` passes against the domain's NestJS endpoint

**Per-domain exit:** domain's routes work from NestJS; rollback = unset `NESTJS_API_URL` for that domain prefix.

---

### Phase 4 — Realtime → NestJS WebSocket Gateway (2.5 weeks)

**Dev script:** `pnpm dev` → `turbo run dev --filter=web --filter=worker --filter=api-nest --filter=realtime-nest`

#### Socket flag state matrix

| Phase | `ENABLE_WEB_EMBEDDED_SOCKET` (web) | `ENABLE_REALTIME_SYSTEM_SUBSCRIBERS` (realtime-nest) | Valid? |
|---|---|---|---|
| Pre-Phase 4 | `true` | `true` (legacy realtime) | Yes (initial state) |
| During cutover | `true` | `true` (realtime-nest) | **BOTH on, double-emit risk** — avoid |
| Phase 4 complete | **`false`** | **`true`** (realtime-nest) | Yes (target) |
| Post-cleanup | n/a (code deleted) | `true` | Yes |

**Migration sequence:**
1. Deploy `realtime-nest` alongside legacy `realtime` with `ENABLE_WEB_EMBEDDED_SOCKET=false` and `ENABLE_REALTIME_SYSTEM_SUBSCRIBERS=true`
2. nginx: flip `location /socket.io/*` upstream from `realtime` to `realtime-nest`
3. Monitor sockets for 24h (no increased error rate)
4. Stop `apps/realtime` container
5. Delete legacy `apps/realtime` + `@repo/realtime` handler code (keep types + room names)

#### Create

- `apps/realtime-nest/`
  - `package.json`, `tsconfig.json` (extends `@repo/tsconfig/nest.json`)
  - `src/main.ts` — HTTP + Socket.io on port `:3001`
  - Custom `RedisAdapterIoAdapter` (reuses `@socket.io/redis-adapter`, already in repo)
  - `ChatGateway` — `@WebSocketGateway({ namespace: '/' })`, `@SubscribeMessage('send_message')` etc.
  - `AdminGateway` — dashboard backfill, notifications
  - `EmployeeGateway` — ticket subscriptions, `auth:force_logout`, `shift:updated`
  - `SystemSubscribersService` — `OnModuleInit` Redis subscriber (channels: `alerts:site:*`, `dashboard:*`, `events:shifts`, `webhooks:panic`, `employee:stream:*`, `ticket:*`)

**No client changes** — same event names, payloads, room model, auth cookies.

#### Exit criteria

- [ ] Admin socket connects, receives `new_message`, `alert`, `active_shifts`
- [ ] Employee socket connects, receives chat, shift updates
- [ ] Redis pub/sub → socket broadcast works end-to-end
- [ ] Legacy `apps/realtime` stopped, no socket errors in 24h window

---

### Phase 5 — Worker → NestJS StandaloneApplication (2 weeks)

**Deliverable:** `apps/worker-nest` replaces `apps/worker`. Uses `@nestjs/bullmq` throughout.

#### Create

- `apps/worker-nest/`
  - `package.json`, `tsconfig.json` (extends `@repo/tsconfig/nest.json`)
  - `src/main.ts` — `NestFactory.createApplicationContext(WorkerModule)`
  - `WorkerModule` — imports `BullMqModule` from server-shared + 8 processor modules
  - `processors/scheduling.processor.ts` — `@Processor('scheduling')`, 5s tick via `OnApplicationBootstrap`
  - `processors/maintenance.processor.ts` — `@Processor('maintenance')`, 1h
  - `processors/office-absence-finalize.processor.ts` — `@Processor('office-absence-finalize')`, 1h
  - `processors/employee-status.processor.ts` — `@Processor('employee-status')`, daily (no-op, legacy)
  - `processors/employee-sync.processor.ts` — `@Processor('employee-sync')`, daily
  - `processors/email.processor.ts` — `@Processor('email')`, SES
  - `processors/shift-reminder.processor.ts` — `@Processor('shift-reminder')`, 5m (FCM)
  - `processors/shift-photo-report.processor.ts` — `@Processor('shift-photo-report')`, 5m

#### Repeatable jobs

Registered via `QueueEvents` + `OnApplicationBootstrap` hooks on each processor's queue — **no custom registrar**. `@nestjs/bullmq` supports this natively.

#### Exit criteria

- [ ] All 7 repeatable jobs registered within 10s of startup (verify via BullMQ admin or `Queue.getRepeatableJobs()`)
- [ ] Scheduling tick fires every 5s ± 1s (synthetic timing test)
- [ ] Graceful shutdown on SIGTERM closes all workers + queues
- [ ] `email.processor.test.ts` and `shift-photo-report/generate.spec.ts` still pass

---

### Phase 6a — API Routes → NestJS, web cleanup (3–4 weeks)

**Deliverable:** All 83 `route.ts` deleted from `apps/web`. `proxy.ts` deleted. `server.ts` socket stripped. `ENABLE_WEB_EMBEDDED_SOCKET=false` permanent. Server Components keep `@repo/database` (not migrated).

#### Actions

1. Delete all 83 `apps/web/app/api/**/route.ts` files
2. Delete `apps/web/proxy.ts`
3. Strip socket bootstrap from `apps/web/server.ts` (remove `initRealtimeSocket` import and call; set `ENABLE_WEB_EMBEDDED_SOCKET=false` env default)
4. Keep `apps/web/server.ts` for Sentry instrumentation hooks + custom error handling (if still needed)
5. Keep `@repo/database` as a `web` dependency (for the 117 admin files)

#### What stays in web

- All admin Server Components (`page.tsx`) that import `@repo/database` directly
- All admin Server Actions (`actions.ts`)
- All admin components that call DB directly
- All client components + hooks

#### What moves

Any Server Action that is invoked by a form and writes to DB must be converted to call the NestJS API instead. Audit needed for the 19 `actions.ts` files (most are admin CRUD — these remain untouched in 6a; only forms that non-admin employees use need the path).

#### Exit criteria

- [ ] `pnpm dev` starts `api-nest` + `worker-nest` + `realtime-nest` (web via `next start`)
- [ ] All API endpoints work via `http://localhost:3002/api/*`
- [ ] Admin pages still render (keeping `@repo/database`)
- [ ] No `route.ts` file left in `apps/web`
- [ ] `ENABLE_WEB_EMBEDDED_SOCKET=false` produces no socket process in web

---

### Phase 6b — Server Components migrate (deferred, 4–6 weeks)

**Not part of this migration.** Future milestone covering 117 admin files:
- 83 `page.tsx` (Server Components doing SSR with Prisma)
- 19 `actions.ts` (Server Actions)
- ~15 components/contexts

Requires a `serverFetch()` helper in `apps/web/lib/server-fetch.ts` that forwards cookies + uses RSC `fetch` caching. Will be planned separately.

---

### Phase 7 — Cleanup (1.5 weeks)

#### Actions

- Delete empty route dirs by explicit name:
  - `apps/web/app/api/external/v1/guard-shifts/grouped/`
  - `apps/web/app/api/admin/alerts/[id]/resolve/`
  - `apps/web/app/api/admin/guard-shifts/export/`
  - `apps/web/app/api/admin/leave-requests/[id]/approve/`
  - `apps/web/app/api/admin/leave-requests/[id]/reject/`
  - `apps/web/app/api/employee/notifications/stream/`
  - `apps/web/app/api/employee/guard-shifts/[id]/` (redundant — these are under `employee/shifts/[id]/`)
  - `apps/web/app/api/admin/shift-photo-reports/[id]/asc/` (if present)
- Update `Dockerfile` — rename images: `app-runner` (Next UI), `api-runner` (NestJS HTTP), `worker-runner` (NestJS worker), `realtime-runner` (NestJS gateway), `migration-runner`. Add `nginx` stage.
- Update `docker-compose.yml` — 6 services: `app` (Next), `api` (NestJS), `worker` (NestJS), `realtime` (NestJS), `migration`, `redis`, `nginx` (reverse proxy)
- Update `pnpm dev` to stable state: `--filter=worker --filter=api --filter=realtime --filter=web`
- Update `AGENTS.md` and `GEMINI.md` to reflect new architecture
- Write `docs/NESTJS_MIGRATION_RESULT.md`

---

## 5. Risk Register

| # | Risk | Sev | Phase | Mitigation |
|---|---|---|---|---|
| R1 | Alerting latency regression (5s tick → notification creation) | **HIGH** | 3, 5 | Read `docs/GUARD_CHECKIN_ALERTING.md` before Phase 3 step 4 and Phase 5. Synthetic timing test (assert tick < 6s) in Phase 5 exit. |
| R2 | JWT cookie mismatch when UI(:3000) and API(:3002) are on different ports | **MED** | 1 | With nginx same-origin in prod, cookies just work. Dev: `sameSite=lax`, no `domain` override. Employee mobile uses `auth.token` payload, unaffected. |
| R3 | Double socket emit during cutover | **MED** | 4 | One documented state matrix (§4 Phase 4). `ENABLE_WEB_EMBEDDED_SOCKET=false` before realtime-nest goes live on the same channel. |
| R4 | 42 pure-function repos don't fit Nest DI pattern | **LOW** | 3 | Official convention: repos are statically imported, not @Injectable(). Documented in §3.2. |
| R5 | Server Actions + Server Components broken by removing `@repo/database` from web | **LOW** | 6a | Phase 6a keeps `@repo/database` as web dependency. Only API route.ts files are deleted. |
| R6 | Mobile app contract broken | **HIGH** | 2 | OpenAPI snapshot-diff test gates Phase 2 exit (§4 Phase 2). No path/method/shape changes. |
| R7 | 61 existing unit tests mock `@repo/database` directly — guard refactors break mocks | **MED** | 1–3 | Keep `verifySession()` exported from `@repo/auth-server`. Add Nest wrappers alongside, don't replace originals until Phase 7. |
| R8 | Native modules (pdfkit, sharp) in worker | **MED** | 5 | Keep esbuild bundling for worker. Nest builder only needed for api-nest and realtime-nest. |
| R9 | 117 Server Components bypass NestJS (address in 6b) | **LOW** (for 6a) | 6a | Phase 6a does NOT migrate them. Deferred to 6b. Risk only if the team later wants to remove `@repo/database` from web. |
| R10 | Strangler cutover in dev has no rolling safety net (env var is manual) | **LOW** | 1–3 | Chosen by design — env var is simpler than a dev proxy. Rollback = unset `NESTJS_API_URL`. |
| R11 | SSR latency regression (Phase 6b, deferred) | **MED** (deferred) | 6b | Not relevant to current migration. Will be addressed in the 6b plan (RSC fetch cache + cookie-forward helper). |
| R12 | OpenAPI auto-generated spec silently differs from hand-written one | **HIGH** | 2 | Snapshot-diff test (§4 Phase 2). Guards every schema change. |
| R13 | Flag state matrix misconfigured leading to double/no emit | **MED** | 4 | Documented table in §4 Phase 4. Test both valid states before cutover. |

---

## 6. Dependency Graph (post-migration)

```
@repo/types (zero deps)
  └── @repo/shared (date-fns, clsx)
        └── @repo/validations (zod, libphonenumber)
              └── @repo/database (prisma, ioredis, bullmq, aws-sdk, pg)
                    ├── @repo/auth-server (jsonwebtoken)
                    ├── @repo/notifications (firebase-admin)
                    └── @repo/storage (aws-sdk)
                    │
                    ├── @repo/server-shared (NestJS library — wraps everything above)
                    │     ├── apps/api-nest
                    │     ├── apps/worker-nest
                    │     └── apps/realtime-nest
                    │
                    ├── apps/web (keeps direct dep for Server Components via Phase 6a only)
                    └── apps/mobile (no change)
```

**Key property:** `@repo/server-shared` is a standard Turbo workspace, not a `nest-cli` monorepo library. Each of the three NestJS apps compiles independently but imports from the same shared library.

---

## 7. Per-Phase Dev Script Shape

| Phase | `pnpm dev` filter chain | Processes started |
|---|---|---|
| 0 | `--filter=web --filter=worker` | Next.js (:3000) + legacy worker |
| 1 | `--filter=web --filter=worker --filter=api-nest` | + api-nest (:3002) |
| 2 | same as 1 | |
| 3 | same as 1 | |
| 4 | `--filter=web --filter=worker --filter=api-nest --filter=realtime-nest` | + realtime-nest (:3001) |
| 5 | same as 4 (worker-nest replaces legacy worker when ready) | |
| 6a | `--filter=worker --filter=api --filter=realtime --filter=web` | All Nest apps + web (without route.ts) |
| 7 | stable state | |

---

## 8. Phase-by-Phase Dependency Table

| Package | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|---|---|---|---|---|---|---|
| `@nestjs/common` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `@nestjs/core` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `@nestjs/config` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `@nestjs/testing` | ✓ (test) | ✓ | ✓ | ✓ | — | — |
| `@nestjs/cli` | ✓ (dev) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `@nestjs/platform-fastify` | — | ✓ | ✓ | ✓ | — | — |
| `fastify` | — | ✓ | ✓ | ✓ | — | — |
| `@fastify/cookie` | — | ✓ | ✓ | ✓ | — | — |
| `@fastify/cors` | — | ✓ | ✓ | ✓ | — | — |
| `@nestjs/swagger` | — | — | ✓ | ✓ | — | — |
| `@nestjs/terminus` | — | ✓ | ✓ | ✓ | — | — |
| `@nestjs/passport` | — | ✓ | ✓ | ✓ | — | — |
| `passport` | — | ✓ | ✓ | ✓ | — | — |
| `passport-jwt` | — | ✓ | ✓ | ✓ | — | — |
| `@nestjs/websockets` | — | — | — | — | ✓ | — |
| `@nestjs/platform-socket.io` | — | — | — | — | ✓ | — |
| `@nestjs/bullmq` | — | — | — | — | — | ✓ |
| `reflect-metadata` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `rxjs` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 9. Open Items (resolved)

| # | Item | Resolution |
|---|---|---|
| 1 | Port `:3001` collision | api-nest → `:3002`; realtime stays `:3001`/`:3004` |
| 2 | Phase 6 scope | 6a only (back-end API routes); 6b deferred |
| 3 | Strangler mechanism | Env var `NESTJS_API_URL` in `proxy.ts` (dev) + nginx (prod) |
| 4 | Socket cutover | nginx `/socket.io/*` upstream switch + documented flag matrix |
| 5 | tsconfig decorator flags | New `packages/tsconfig/nest.json`, don't touch `base.json` |
| 6 | `@nestjs/bullmq` | Adopted; drop custom registrars |
| 7 | OpenAPI freeze | Snapshot `openapi.json` + diff-test.gate Phase 2 |
| 8 | DI convention | Repos are statically imported, not injectable. Documented §3.2 |
| 9 | Playwright e2e | Deprioritized (user confirmed experimental) |
| 10 | Mobile contract | Phase 2 contract test covers it |
| 11 | Permissions source | `apps/web/lib/auth/permissions.ts` — 34 resources. NestJS reuses same file. |

---

*End of document.*
