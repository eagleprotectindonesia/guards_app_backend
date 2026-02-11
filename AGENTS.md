# Repository Guidelines

## Project Structure & Module Organization
This repository is a TurboRepo monorepo.
- `apps/web`: Next.js app (admin + guard interfaces, API routes, tests under `apps/web/tests`).
- `apps/worker`: background worker for scheduling, alerts, and queue processing.
- `packages/database`: Prisma schema, DB client, and seed scripts.
- `packages/shared`, `packages/types`, `packages/validations`: shared logic, types, and Zod schemas.
- `tests/e2e`: Playwright end-to-end suites (`attendance/`, `chat/`, `realtime/`) with shared fixtures/helpers.

## Build, Test, and Development Commands
Run from repository root unless noted.
- `npm run dev`: starts web + worker in development.
- `npm run dev:https`: runs HTTPS dev flow for web and worker.
- `npm run build`: builds all workspaces through Turbo.
- `npm run lint`: runs workspace lint and type-check tasks.
- `npm run test`: runs Jest unit/integration tests.
- `npm run test:e2e`: runs Playwright E2E tests.
- `npx turbo run db:push`: applies Prisma schema to the configured database.

## Coding Style & Naming Conventions
- TypeScript-first across apps and packages.
- Prettier config: 2 spaces, single quotes, semicolons, `printWidth: 120`.
- Use ESLint per workspace (`npm run lint`).
- Naming patterns: React components in `PascalCase`; utility/modules in `kebab-case` or descriptive file names (follow nearby files); tests use `*.spec.ts` or `*.test.ts`.

## Testing Guidelines
- Unit/integration: Jest (`jest.config.js` at repo root).
- E2E: Playwright (`tests/e2e`, see `tests/e2e/README.md`).
- Keep tests close to behavior boundaries (API routes, worker processors, realtime events).
- Use deterministic fixtures/factories from `tests/e2e/fixtures`.
- Before opening a PR, run: `npm run test` and `npm run test:e2e` for relevant touched flows.

## Commit & Pull Request Guidelines
Git history shows mostly concise, imperative commits, often with Conventional Commit style (e.g., `feat(database): ...`).
- Prefer format: `<type>(<scope>): <imperative summary>` (example: `fix(worker): handle missed check-in retry`).
- Keep commits focused and logically grouped.
- PRs should include: clear summary, impacted areas (`apps/web`, `apps/worker`, etc.), test evidence (commands run), and linked issue/task.
- For UI or API contract changes, include screenshots or request/response examples.

## Security & Configuration Tips
- Never commit secrets; use `.env`, `.env.test`, and examples as templates.
- Validate `DATABASE_URL`, `REDIS_URL`, and related keys before running dev/test commands.
