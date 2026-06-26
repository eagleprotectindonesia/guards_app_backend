# Agent Guidelines

## Project Structure

TurboRepo monorepo (`pnpm@10.32.1`, `turbo@^2.9.14`).

- `apps/web`: Next.js 16 App Router (admin + employee interfaces, API routes). Uses `proxy.ts` instead of `middleware.ts` for auth. Custom server (`server.ts`) embeds Socket.io via `@repo/realtime` — in default dev mode, realtime is bundled into web.
- `apps/mobile`: Expo/React Native mobile app for guards. Uses `EXPO_UNSTABLE_HEADLESS=1`, `APP_VARIANT` for builds.
- `apps/worker`: Background Node.js process (BullMQ queues, shift monitoring, alert generation).
- `apps/realtime`: Standalone Socket.io deployment target (port 3001, exposed as 3004 in prod). Uses Redis adapter. Runs as a separate process only in production or via `pnpm dev:split`.
- `packages/database`: Prisma schema/ORM client, Redis (ioredis), S3, SES, BullMQ queue definitions, repositories. Exports subpaths: `prisma`, `redis`, `integrations`, `repositories`.
- `packages/auth-server`, `packages/notifications`, `packages/storage`, `packages/realtime`: server-side library packages.
- `packages/shared`, `packages/types`, `packages/validations`: shared utilities, TS types, Zod schemas.
- `packages/eslint-config`, `packages/tsconfig`: shared config.
- `tests/e2e`: Playwright E2E suites (attendance, chat, realtime).
- `docs/`: 19 markdown files covering business logic. **`docs/GUARD_CHECKIN_ALERTING.md` is required reading** for shift/check-in/alert changes.

## Commands (run from root)

- **Dev:** `pnpm dev` (web + worker), `pnpm dev:split` (+ realtime), `pnpm dev:https`/`pnpm dev:https:split` for HTTPS. All use `node --env-file=.env` — env must be at root as `.env`.
- **Postinstall:** runs `prisma:generate` via turbo. Skip with `SKIP_TURBO_POSTINSTALL=1`.
- **DB push:** `pnpm turbo run db:push` (requires `DATABASE_URL`, handles generate dependency).
- **Lint:** `rtk pnpm lint` (not `rtk lint` — ESLint v9 root config issue). Runs `turbo run lint type-check`. Turbo respects type-check → lint dependsOn ordering per workspace.
- **Test:**
  - `pnpm test` — Jest unit tests (triggers full build first via turbo dependsOn).
  - `pnpm test:integration:setup` — pushes schema to test DB.
  - `pnpm test:integration` — smoke integration (2 attendance/checkin test files).
  - `pnpm test:integration:full` — all `apps/web/tests/integration/**/*.test.ts`.
  - `pnpm test:e2e` — Playwright (`tests/e2e/`). Requires PostgreSQL + Redis + server running.
- **Build:** `pnpm build` — builds all workspaces.

## Conventions

- Prettier config in `.prettierrc`. Jest config in root `jest.config.js` (ts-jest with `isolatedModules: true`).
- `rtk pnpm lint` is the one command for both lint and type-check. Do not run `tsc --noEmit` directly on root — turbo handles workspace ordering.
- Add deps with `--filter <workspace>`, runtime deps stay in their workspace.
- `.env` at root for dev; `.env.test` for tests. Time zone: `Asia/Makassar`.

## Deploy

- `main` → production (ECR + EC2, docker-compose). `develop` → staging.
- Docker produces 4 multi-stage images: `app-runner`, `worker-runner`, `realtime-runner`, `migration-runner`.
