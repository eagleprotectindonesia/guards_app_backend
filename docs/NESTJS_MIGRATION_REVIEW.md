# NestJS Migration Plan — Review & Recommendations

> Review of `docs/NESTJS_MIGRATION_AUDIT.md`, grounded in the current codebase.
> Answers to clarifying questions are incorporated: (1) port/origin topology undecided — recommendation below; (2) Server Actions → HTTP calls to NestJS; (3) single engineer, sequential; (4) socket cutover via nginx routing `/socket.io/*`.

---

## 1. Verdict

**Approve with changes — but Phase 0 is NOT ready to execute until the blocking gaps in §2 are resolved.**

The overall direction (NestJS 11 + Fastify, strangler fig, preserve `@repo/*` packages, `@repo/server-shared` as the Nest module library) is sound and matches the codebase. However the plan is missing the **control plane** that makes a strangler migration safe: a defined reverse proxy, a per-route cutover mechanism, and an honest accounting of the 96 non-API files in `apps/web/app` that bypass the API layer and call Prisma directly. Fix those, then Phase 0 can proceed.

---

## 2. Blocking Architectural Gaps (must resolve before Phase 0)

### B1. The "strangler proxy" is mentioned 6 times and never defined.

Phase 1 says "strangler proxy routes traffic"; Phase 3 says "a reverse proxy (or strangler flag) cuts over per endpoint"; §3.1 lists "Strangler, flag-controlled" as a locked decision. None of these specify:

- What software (nginx? Caddy? Next.js `rewrites`? an env-gated switch in `proxy.ts`?)
- Where it runs in **dev** (today dev is `node --env-file=.env` + turbo parallel — there is **no** proxy in the dev loop)
- What the cutover unit is (per URL path? per env var? per feature flag?)
- How a route is flipped back if NestJS serves a bad response

The socket-cutover answer (nginx routes `/socket.io/*` to `realtime-nest`) already commits to nginx. **Make nginx the single origin for dev + prod and define the cutover unit there.** Without this, Phase 1's `/api/health` migration and every Phase 3 domain migration have no safe rollback path.

**Recommendation:** Add a Phase 0.5 (or fold into Phase 0) that introduces `nginx` (or Caddy) as the dev+prod gateway on the public port (e.g. `:3000` / `:443`), with upstreams `web` (`:3001` internal), `api-nest` (`:3002` internal), `realtime-nest` (`:3003` internal). Cutover = toggling a `location` block per path group. Add a `docker-compose-dev.yml` nginx service (there is already a `docker-compose-dev.yml` — extend it). Update `pnpm dev` to bring nginx up.

### B2. Port `:3001` is double-booked.

§2.2 assigns `:3001`/`:3004` to the realtime process. §8.1 and Phase 1 propose api-nest on `:3001`. These collide. With nginx in front (B1) the public port is unique and internal ports are free — reassign api-nest to an unused internal port (e.g. `:3002`) and keep realtime-nest on `:3001`/`:3004` as today. Update §3 architecture diagram and §8.1 accordingly.

### B3. Phase 6 scope is dramatically understated — 96 files bypass the API layer.

The plan's Phase 6 says: "Server actions in `apps/web/app/(admin|employee)/**/actions.ts` either call NestJS HTTP or import Nest services." This addresses only **20 `actions.ts` files**. The codebase actually contains **96 admin-side files** that `import from '@repo/database'` directly:

| Type | Count |
|---|---|
| `page.tsx` (Server Components doing SSR with direct Prisma) | **57** |
| `actions.ts` (Server Actions) | 20 |
| Other components (`*.tsx` under `components/`) | 18 |
| **Total** | **96** |

All 96 are under `app/admin/`. Zero under `app/employee/` (employee side is already API-driven).

This breaks the "web is UI-only" end state in three ways:

1. **Scope:** Phase 6 is not "delete 85 `route.ts` + 20 `actions.ts`". It is "refactor 96 files (57 of them Server Components) + delete 85 routes + delete `server.ts` + delete `proxy.ts`". 1 week is not realistic — see §5 timeline.
2. **SSR latency:** A `page.tsx` that today does one Prisma query in-process will, after migration, do an HTTP round-trip to NestJS (auth cookie forwarding + JSON parse) on every render. 57 pages × per-render latency. The plan does not acknowledge this cost or propose mitigations (RSC caching, `fetch` with `cache: 'force-cache'`, server-component data prefetching, or accepting a perf regression).
3. **Auth in SSR:** Server Components render on the Next.js server. To call NestJS they must forward the admin cookie from the incoming request to the NestJS fetch. `fetch` in a Server Component does **not** automatically forward cookies — every SSR data call needs `headers()` → `Cookie` header → NestJS. This is a non-trivial pattern and must be specified once and reused, or extracted into a `serverFetch()` helper in `apps/web/lib/`.

**Recommendation:**
- Promote the 96-file refactor to its own workstream. Do **not** bundle it into the 1-week Phase 6.
- Decide and document the SSR→NestJS data-fetching pattern (cookie forwarding + caching strategy) **before** Phase 3 starts, because Phase 3 domain PRs should expose NestJS endpoints that match what the Server Components will later call.
- Consider an explicit interim state: after Phase 3, `@repo/database` is still a `web` dependency and Server Components still query Prisma directly; only `route.ts` files have moved. "Web is UI-only" becomes a **separate, later milestone** (call it Phase 6a: API routes; Phase 6b: Server Components/Actions). This decouples the backend migration from a much riskier frontend refactor.

### B4. `@nestjs/bullmq` is used in spirit but absent from the dependency list and the plan.

§3.2 and Phase 5 use `@Processor('scheduling')` syntax — that is `@nestjs/bullmq` decorator syntax. But §7.1 does not list `@nestjs/bullmq`, and §4 Phase 5 says "No `@nestjs/schedule` — BullMQ repeatable jobs are preserved" via a hand-rolled `RepeatableJobRegistrarService`. The plan is internally inconsistent: either use `@nestjs/bullmq` (first-party, supports `@Processor` + repeatable jobs natively) and drop the custom registrar, or don't use `@Processor` and roll everything by hand. The former is strongly recommended — the custom registrar is reinventing `@nestjs/bullmq`'s `Queue` + `Worker` host.

**Recommendation:** Adopt `@nestjs/bullmq`. Add it to §7.1 deps. Delete the `RepeatableJobRegistrarService` concept. Register repeatable jobs in an `OnApplicationBootstrap` hook on each processor's queue (the library supports this directly).

---

## 3. Significant Issues (address in the plan, not blocking Phase 0)

### S1. "1 nest-cli monorepo, 3 bootstrap()s" with "shared DI graph" is a misconception.

Each `bootstrap()` produces an **independent Nest DI container**. The three apps share **module source code** (via `@repo/server-shared`), not a DI graph. The rationale column ("Least duplication; shared DI graph") is inaccurate. Also, `nest-cli`'s monorepo mode has constraints (single `nest-cli.json`, projects under `apps/`/`libs/`, shared `tsconfig` defaults) that interact awkwardly with the existing TurboRepo layout.

**Recommendation:** Drop the "shared DI graph" rationale. Consider **not** using `nest-cli` monorepo mode at all — keep the existing TurboRepo structure (`apps/api-nest`, `apps/worker-nest`, `apps/realtime-nest` as plain workspaces, each with its own `tsconfig.json` extending a new `packages/tsconfig/nest.json`). `nest-cli` is only needed for schematics and watch mode; both work per-app. This avoids fighting `nest-cli`'s monorepo assumptions and keeps Turbo as the single build orchestrator.

### S2. `tsconfig` decorator change is applied to `base.json` and pollutes every package.

Phase 0 adds `experimentalDecorators` + `emitDecoratorMetadata` to `packages/tsconfig/base.json`. `base.json` is inherited by `@repo/types`, `@repo/shared`, `@repo/validations`, `@repo/database`, `apps/web`, `apps/mobile`, `apps/worker`. Effects:

- `emitDecoratorMetadata` forces the TS compiler to emit design-time type info — increases output size for packages that have zero decorators.
- Next.js 16 / Turbopack and React Server Components have opinions about decorator metadata in the server bundle; this is low-risk but unverified for this stack.
- `isolatedModules: true` (already in `base.json`) coexists with `emitDecoratorMetadata`, but combined with `verbatimModuleSyntax` (if ever enabled) it breaks. Worth a note.

**Recommendation:** Create `packages/tsconfig/nest.json` that extends `base.json` and adds the two decorator flags + `"types": ["node"]`. Only `apps/*-nest` and `packages/server-shared` extend `nest.json`. Leave `base.json` untouched. This is a one-line change per NestJS tsconfig and zero risk to the rest of the repo.

### S3. Missing critical NestJS dependencies in §7.1.

§7.1 lists `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/common`, `@nestjs/core`, `@nestjs/testing`, `@nestjs/config`, `reflect-metadata`, `rxjs`. The plan's locked decisions and later phases require packages that are **not** listed:

- `@nestjs/platform-fastify` — required for the locked "Fastify" decision (Phase 1).
- `fastify`, `@fastify/cookie`, `@fastify/cors` — cookie parsing for `verifySession`, CORS if any dual-origin window remains.
- `passport`, `passport-jwt`, `@nestjs/passport` — `JwtStrategy` (Phase 1).
- `@nestjs/swagger` — `/api/docs` + auto OpenAPI (Phase 2, locked in §3.1).
- `@nestjs/terminus` — `HealthModule` (§3.2).
- `@nestjs/websockets`, `@nestjs/platform-socket.io` — Phase 4 gateways.
- `@nestjs/bullmq` — see B4.
- `@socket.io/redis-adapter` — already in the repo (verify), but call out that it is retained.

**Recommendation:** Replace §7.1's flat list with a per-phase dependency table so each phase's exit criteria can be checked against the deps it actually needs. Phase 0 can stay minimal (common/core/config/testing + reflect-metadata + rxjs), but Phase 1 will immediately need platform-fastify + passport + cookie + terminus — list them now so install is one command.

### S4. `ENABLE_LEGACY_WEB_SOCKET` reinvents an existing flag.

`apps/realtime/src/server.ts:5` already gates system subscribers with `process.env.ENABLE_REALTIME_SYSTEM_SUBSCRIBERS !== 'false'`. The plan introduces a new `ENABLE_LEGACY_WEB_SOCKET` flag (§3.1, R3) and a separate `ENABLE_REALTIME_SYSTEM_SUBSCRIBERS` mention (Phase 4). Two flags for the same cutover is a recipe for "both on → double emit" / "both off → no emit".

**Recommendation:** Use **one** flag, scoped per process:
- On `apps/web/server.ts` (legacy embedded socket): `ENABLE_WEB_EMBEDDED_SOCKET` (default `true` until Phase 4 cutover, then `false`).
- On `realtime-nest`: keep the existing `ENABLE_REALTIME_SYSTEM_SUBSCRIBERS` semantics.
Document the four `(web, nest)` states and which is valid during each phase. Strike `ENABLE_LEGACY_WEB_SOCKET` from the plan.

### S5. Auth extraction strategies are under-specified for Phase 1/2.

`proxy.ts` authenticates three different ways: admin cookie, employee cookie, `X-API-KEY` header for `/api/external/*`. Socket auth uses `handshake.auth.token` **or** cookie. The plan lists `JwtStrategy`, `JwtAuthGuard`, `WsJwtGuard`, `PermissionsGuard`. Missing:

- An **`ApiKeyStrategy`/`ApiKeyGuard`** for `ExternalApiModule` (Phase 2). Without it, the external API cannot be migrated without breaking the mobile contract.
- A single point that documents: cookie name → extractor → strategy mapping, so the NestJS side mirrors `AUTH_COOKIES.ADMIN`/`.EMPLOYEE` exactly (names, `sameSite`, `path`, `domain`).

**Recommendation:** Add `ApiKeyGuard` to Phase 2 deliverables. Add an "Auth contract" subsection to §3 that enumerates the three extraction paths and the exact cookie constants to reuse. Phase 1 exit criterion should include "admin login → cookie accepted by NestJS `/api/health`-style protected route" — not just "AuthModule ready".

### S6. OpenAPI auto-generation risks silently breaking the mobile contract.

Phase 2 says "auto-generated Swagger replaces the manual `openapi.json` route." The current `apps/web/app/api/external/v1/openapi.json/route.ts` is hand-maintained. NestJS Swagger generation produces a schema from DTOs + controllers + `@ApiProperty` decorators; field ordering, `nullable` vs `oneOf`, `$ref` naming, and `additionalProperties` will all differ from the hand-written file even when the wire shape is identical. R6 says "freeze via OpenAPI contract tests" but doesn't define the freeze mechanism.

**Recommendation:** Before Phase 2 starts:
1. Snapshot the current `openapi.json` output as `tests/contracts/external-api.snapshot.json`.
2. Write a Jest test that boots the NestJS `ExternalApiModule`, calls `SwaggerModule` to produce JSON, and **asserts semantic equality** (normalize then deep-equal — not byte-equal) against the snapshot.
3. Gate Phase 2 completion on that test passing. Any diff is a contract break and must be an explicit decision (update snapshot + bump mobile version).

### S7. Repositories-as-pure-imports is the right call but must be an explicit convention.

R4 says "Wrap per-domain in Nest `@Injectable()` services. Repos stay as pure imports." This is non-idiomatic NestJS (normally everything is injected for testability) but it is the **correct** call here: it preserves the 61 unit tests that `jest.mock('@repo/database/...')` and avoids rewriting 41 repo files. The plan should make this a documented convention, not a buried risk note.

**Recommendation:** Add a "DI convention" subsection to §3: `@Injectable()` services may inject only Nest providers (`PrismaService`, `RedisService`, `ConfigService`); repository functions are statically imported. Call out the tradeoff: Nest-level integration tests cannot swap repo implementations via DI — they must use Jest module mocking as today. Acceptable, but make it a stated rule so contributors don't start injecting repos and breaking the pattern.

### S8. E2E gating is missing from every phase except implicitly Phase 2.

There are 6 Playwright e2e specs (`attendance/*`, `chat/messages`, `realtime/socket-events`). The plan only mentions contract tests for Phase 2. There is no statement that e.g. Phase 3 step 4 (shifts/attendance/checkins) must keep `attendance/*.spec.ts` green against the nginx origin (which by then routes shifts/attendance to NestJS).

**Recommendation:** Add to every Phase 3 domain PR: "e2e specs touching this domain pass against the nginx origin." This is the actual strangler safety net — the plan should say so. If a domain has no e2e coverage today, the domain PR must add at least one spec.

### S9. `/api/health` migration (Phase 1) has an operational trap.

Docker health checks and any nginx upstream health check today hit `:3000/api/health` served by Next.js. Phase 1 moves `/api/health` to NestJS. During the window where nginx routes `/api/health` to NestJS but NestJS is starting/failing, the container healthcheck fails and orchestrator restarts the **web** container (which is healthy). Decouple infra health from app health.

**Recommendation:** nginx gets its own `/healthz` (nginx-level, returns 200 if config loaded). The app `/api/health` (NestJS) and `/api/health` (Next.js fallback) are app-level only. Document which one Docker `HEALTHCHECK` and docker-compose `healthcheck` use — and update `Dockerfile`/`docker-compose.yml` in Phase 1, not Phase 7.

### S10. Dev script evolution is unspecified.

`pnpm dev` today runs `turbo run dev --filter=web --filter=worker`. After Phase 1 it must also start `api-nest`; after Phase 4, `realtime-nest`; from Phase 0.5, `nginx`. The plan never updates the dev script per phase, so a reviewer cannot tell what "dev works" means at each phase boundary.

**Recommendation:** Add a per-phase "dev script shape" line to each phase's Verification section. E.g. Phase 1: `pnpm dev` → `--filter=web --filter=worker --filter=api-nest` + nginx sidecar.

---

## 4. Smaller Corrections (non-blocking, but fix the plan)

- **§2.1 route count: "85 route.ts files, ~6982 LOC"** — actual is **83** `route.ts` files, 6982 LOC confirmed. Update count; 6982 is right.
- **§2.1 "41 pure-function repository files"** — actual is **43** non-test `.ts` files in `packages/database/src/repositories/`. Update.
- **§2.5 test inventory: "1 spec (208 LOC) e2e"** — actual is **6** specs across `attendance/`, `chat/`, `realtime/`. The inventory table is wrong and undersells the safety net. Update.
- **§2.3 "RBAC: 35 permission codes from `@repo/validations`"** — the canonical `PermissionCode` source is `apps/web/lib/auth/permissions.ts` (the `PERMISSIONS` const + `RESOURCES` × `ACTIONS`). `@repo/validations` only consumes it. Phase 1's `PermissionsGuard` must import from the correct source. Count is **>35** (28 resources × up to 4 actions, minus sparse ones — count the actual `PERMISSIONS` entries, not a rounded 35).
- **§2.1 "auth-server 248 LOC"** — `packages/auth-server/src/session.ts` is 248 LOC (confirmed). Fine.
- **§2.1 `apps/web/lib/auth/` lists `admin-auth.ts (165), employee-auth.ts (83)`** — these two files live at `apps/web/lib/admin-auth.ts` and `apps/web/lib/employee-auth.ts`, **not** under `lib/auth/`. `lib/auth/` contains `permissions.ts`, `session.ts`, `2fa.ts`, `has-permission.ts`, `admin-visibility.ts`, `leave-ownership.ts`, `session-helper.ts`, `constants.ts`. Fix the path; it matters for Phase 1 because the plan must move/keep these with the right module.
- **§3.1 "Delete 7 empty route.ts dirs"** — actual empty dirs under `apps/web/app/api/` = **9** (listed: `external/v1/guard-shifts/grouped`, `admin/alerts/[id]/resolve`, `admin/guard-shifts/export`, `admin/leave-requests/[id]/approve`, `admin/leave-requests/[id]/reject`, `employee/notifications/stream`, `employee/guard-shifts/[id]/guard-checkin`, `employee/guard-shifts/[id]/attendance`, `employee/guard-shifts/[id]/heartbeat`). Update count to 9; also note 3 of them are under `employee/guard-shifts/[id]/*` which suggests those endpoints were never implemented — confirm they are intentionally absent before deleting (the audit's Phase 3 step 4 covers shifts/attendance/checkins — make sure these aren't expected endpoints that were simply never wired).
- **§7 "legacy `@nestjs/cli` devDependency if no longer needed"** — there is **no** `@nestjs/cli` in the repo today (`package.json` + `pnpm-lock.yaml` have zero `@nestjs/*` entries). The "remove" step in Phase 7 is a no-op. Strike it.
- **§6 dependency graph** — fine, but note `@repo/server-shared` currently exists as an empty `src/` shell (confirmed); Phase 0 populates it.

---

## 5. Timeline Reassessment (single engineer, sequential)

With the "parallel" wording corrected to "sequential" (per your answer), re-deriving from the plan's own per-phase estimates:

| Phase | Plan estimate | Re-estimate | Delta reason |
|---|---|---|---|
| 0 Foundations | 1 wk | **1.5 wk** | Add nginx dev setup + `tsconfig/nest.json` + full dep install |
| 1 Auth + Health | 1.5 wk | **2 wk** | Add ApiKeyGuard planning, `/healthz` separation, dev script changes |
| 2 External API | 1 wk | **1.5 wk** | Add OpenAPI snapshot-diff test before cutover |
| 3 Domain migrations | 6–8 wk | **8–10 wk** | 11 domains sequential + ~0.5 day/domain for e2e gating + per-domain contract verification |
| 4 Realtime → Nest gateway | 2 wk | **2.5 wk** | Redis adapter IoAdapter + flag-state matrix testing |
| 5 Worker → Nest standalone | 2 wk | **2 wk** | OK if `@nestjs/bullmq` adopted (B4) |
| 6 Web → UI-only | 1 wk | **3–4 wk** (API routes only) **+ 4–6 wk** (96 Server Components/Actions) | B3. Split into 6a/6b. |
| 7 Cleanup | 1 wk | **1.5 wk** | Docker image set re enumeration + compose updates |
| **Total** | **~15 wk** | **~25–31 wk** | |

**The 15-week headline is not achievable for a single engineer once Phase 6's real scope (B3) and the missing infra work (B1) are counted.** Two options:

1. **Keep the 15-week backend target** by deferring "web is UI-only" (Phase 6b, the 96-file Server Component refactor) to a follow-on milestone. The NestJS backend is production-ready at ~week 18–20; the frontend fully decouples ~week 25–31. This is the strangler-fig intent and is a legitimate shape.
2. **Cut domain scope** — e.g. defer office-shifts / holidays / memos / audit-logs / exports to post-v1 and bring the backend cutover in tighter. Reduces Phase 3 from 11 to ~7 domains.

Pick one explicitly and update §1 + §4.

---

## 6. Risk Register — Additions and Amendments

| # | Risk | Severity | Note |
|---|---|---|---|
| R9 | **96 Server Components/Actions bypass the API and call Prisma directly** — "web is UI-only" end state requires refactoring all 96, not just `actions.ts` | **HIGH** | New. See B3. Either split Phase 6 or accept `@repo/database` stays in web indefinitely. |
| R10 | **No reverse proxy in dev** — strangler cutover has no safe rollback path during development | **HIGH** | New. See B1. |
| R11 | **SSR latency regression** — 57 Server Components move from in-process Prisma to HTTP-to-NestJS per render | **MED** | New. See B3. Mitigate with RSC `fetch` caching + a `serverFetch()` cookie-forwarding helper. |
| R12 | **OpenAPI auto-gen drift** — NestJS Swagger output differs from hand-maintained `openapi.json` and silently breaks mobile | **HIGH** | New. See S6. Mitigate with snapshot-diff test gating Phase 2. |
| R13 | **Double socket emit during cutover** — two flags (`ENABLE_LEGACY_WEB_SOCKET` + `ENABLE_REALTIME_SYSTEM_SUBSCRIBERS`) mis-set | **MED** | New. See S4. Collapse to one flag with a documented state matrix. |
| R2 amend | Cookie mismatch | **MED** (was HIGH) | With nginx single-origin (B1), cookies just work — downgrade after B1 is adopted. Strike the `sameSite`/domain workarounds. |
| R4 amend | Repos don't fit Nest DI | **LOW** (was MED) | With the "repos as pure imports" convention (S7) this is a non-issue. Document and downgrade. |

---

## 7. Phase-by-Phase Recommendations (deltas to the plan)

### Phase 0 (add)
- Introduce nginx dev gateway (B1) — either here or as Phase 0.5.
- Create `packages/tsconfig/nest.json`, do **not** touch `base.json` (S2).
- Replace §7.1 dep list with the per-phase table (S3). Install Phase 0 + Phase 1 deps now so the first Phase 1 PR doesn't stall on a missing package.
- Add `RedisService` injectable smoke test, not just `PrismaService` (Verification only mentions Prisma today).
- Decide `@nestjs/bullmq` adoption now (B4) so server-shared's `DatabaseModule` can expose a `QueueModule` from day one.

### Phase 1 (add)
- ApiKeyGuard planning (S5) — even if implementation is Phase 2, the auth module shape must accommodate it.
- `/healthz` (nginx) vs `/api/health` (app) split (S9). Update `Dockerfile`/`docker-compose.yml` here.
- Document the cookie constant reuse (`AUTH_COOKIES.*` exact names + `sameSite`/`path`/`domain`).
- Dev script: add `--filter=api-nest` + nginx sidecar (S10).
- Reassign api-nest internal port off `:3001` (B2).

### Phase 2 (add)
- OpenAPI snapshot-diff test gating (S6).
- Confirm the 3 employee `guard-shifts/[id]/*` empty dirs (§4) are intentionally absent — if they are expected endpoints, Phase 2/3 must implement them, not delete them.

### Phase 3 (add)
- Per-domain e2e gating against nginx origin (S8).
- "Sequential, not parallel" — strike the word "parallel" from §4 Phase 3 header.
- Define the SSR data-fetching pattern (B3) **before** step 4 (shifts/attendance) so the NestJS controller shapes match what Server Components will later consume.
- Read `docs/GUARD_CHECKIN_ALERTING.md` before step 4 **and** before Phase 5 scheduling processor — already in R1, keep.

### Phase 4 (add)
- One-flag state matrix (S4).
- Custom `RedisAdapterIoAdapter` — confirm `@socket.io/redis-adapter` is already a dep (it is, in `apps/realtime`); reuse, don't re-add.
- nginx `/socket.io/*` location block flip is the cutover mechanism (per your answer) — document the exact location block and the rollback.

### Phase 5 (add)
- Adopt `@nestjs/bullmq`, drop custom registrar (B4).
- Synthetic timing test for the 5s scheduling tick (R1) — add as exit criterion, not just a mitigation.

### Phase 6 (split)
- **6a — API routes:** delete 85 `route.ts`, delete `proxy.ts`, delete `server.ts` socket bootstrap. Web still imports `@repo/database` for SSR. ~3–4 weeks.
- **6b — Server Components/Actions:** migrate 96 files to `serverFetch()` against NestJS. ~4–6 weeks. Can run **after** the backend is declared done.
- Strike option (b) "import NestJS services in-process" — per your decision, commit to HTTP calls (S5/B3).

### Phase 7 (add)
- Enumerate the final Docker image set: `app-runner` (Next UI), `api-runner` (NestJS HTTP), `worker-runner` (NestJS worker), `realtime-runner` (NestJS gateway), `migration-runner`, + `nginx` (if containerized) = 6 services in compose (today: 5).
- Strike the "remove `@nestjs/cli` devDep" line — it doesn't exist today (§4 Smaller Corrections).

---

## 8. Open Questions for You

1. **Phase 6 split (B3 / §7 Phase 6):** OK to declare backend "done" at end of Phase 6a and treat 6b (96 Server Components) as a separate follow-on milestone? This is the single biggest timeline lever.
2. **nginx in dev (B1):** are you willing to add an nginx service to `docker-compose-dev.yml` and the `pnpm dev` flow, or do you want a Node-based proxy (e.g. `http-proxy-middleware` inside a small dev-only script) to avoid introducing nginx as a dev dependency?
3. **`@nestjs/bullmq` (B4):** confirm adoption — it changes Phase 5's file list and the `server-shared` Queue module shape.
4. **Deferred domains (§5 option 2):** if 15 weeks is a hard target, which of office-shifts / holidays / memos / audit-logs / exports / panic can move to post-v1? These are the lowest-traffic candidates.
5. **Mobile contract freeze (S6):** do you have a way to capture the current `openapi.json` from a running prod instance as the snapshot, or should the snapshot be generated from the current Next.js route + a manual review pass?
