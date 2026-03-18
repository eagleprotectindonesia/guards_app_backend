# Repository Guidelines

## Project Structure & Module Organization
This repository is a TurboRepo monorepo.
- `apps/web`: Next.js app (admin + employee interfaces, API routes, tests under `apps/web/tests`).
- `apps/mobile`: Expo/React Native mobile app for guards.
- `apps/worker`: background worker for scheduling, alerts, and queue processing.
- `packages/database`: Prisma schema, DB client, and seed scripts.
- `packages/shared`, `packages/types`, `packages/validations`: shared logic, types, and Zod schemas.
- `packages/eslint-config`, `packages/tsconfig`: shared linting and TypeScript configuration.
- `tests/e2e`: Playwright end-to-end suites (`attendance/`, `chat/`, `realtime/`) with shared fixtures/helpers.

## Build, Test, and Development Commands
Run from repository root unless noted.
- `pnpm dev`: starts web + worker in development.
- `pnpm dev:mobile`: starts mobile app in development mode.
- `pnpm dev:https`: runs HTTPS dev flow for web and worker.
- `pnpm build`: builds all workspaces through Turbo.
- `pnpm lint`: runs workspace lint and type-check tasks.
- `pnpm test`: runs Jest unit/integration tests.
- `pnpm test:e2e`: runs Playwright E2E tests.
- `pnpm turbo run db:push`: applies Prisma schema to the configured database.

## Coding Style & Naming Conventions
- TypeScript-first across apps and packages.
- Prettier config: 2 spaces, single quotes, semicolons, `printWidth: 120`.
- Use ESLint per workspace (`pnpm lint`).
- Naming patterns: React components in `PascalCase`; utility/modules in `kebab-case` or descriptive file names (follow nearby files); tests use `*.spec.ts` or `*.test.ts`.

## Testing Guidelines
- Unit/integration: Jest (`jest.config.js` at repo root).
- E2E: Playwright (`tests/e2e`, see `tests/e2e/README.md`).
- Keep tests close to behavior boundaries (API routes, worker processors, realtime events).
- Use deterministic fixtures/factories from `tests/e2e/fixtures`.
- Before opening a PR, run: `pnpm test` and `pnpm test:e2e` for relevant touched flows.

## Commit & Pull Request Guidelines
Git history shows mostly concise, imperative commits, often with Conventional Commit style (e.g., `feat(database): ...`).
- Prefer format: `<type>(<scope>): <imperative summary>` (example: `fix(worker): handle missed check-in retry`).
- Keep commits focused and logically grouped.
- PRs should include: clear summary, impacted areas (`apps/web`, `apps/worker`, etc.), test evidence (commands run), and linked issue/task.
- For UI or API contract changes, include screenshots or request/response examples.

## Security & Configuration Tips
- Never commit secrets; use `.env`, `.env.test`, and examples as templates.
- Validate `DATABASE_URL`, `REDIS_URL`, and related keys before running dev/test commands.
