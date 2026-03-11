# Dependency Policy

This monorepo uses `pnpm` workspaces. Dependency ownership is strict by default.

## Rules

- Run installs from the repository root with `pnpm install`.
- Add dependencies to the workspace that directly imports or executes them.
- Add root dependencies only for repository-wide tooling such as Turbo, Jest, ESLint, Prettier, and TypeScript.
- Do not place app runtime dependencies like `react`, `react-dom`, `next`, `expo`, or `react-native` in the root package unless the root package directly imports them.
- Prefer workspace-targeted commands:
  - `pnpm add <pkg> --filter web`
  - `pnpm add <pkg> --filter mobile`
  - `pnpm add -D <pkg> -w`

## Expected ownership

- `apps/web`: web runtime dependencies such as `next`, `react`, and `react-dom`
- `apps/mobile`: Expo and React Native dependencies
- `apps/worker`: worker runtime and build dependencies
- `packages/*`: only dependencies used directly by that package

## Exceptions

- Add `peerDependencies` only for reusable packages that intentionally expect the consuming app to provide the framework dependency.
- If a framework tool requires a hoist-related exception under `pnpm`, keep the exception narrow and document it here.
