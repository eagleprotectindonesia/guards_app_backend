# EP Guard Scheduling

**EP Guard Scheduling** is a comprehensive Full-Stack monorepo application designed for managing security guard schedules, tracking attendance, and monitoring real-time check-ins. It is managed with **TurboRepo** and built with **Next.js 16 (App Router)** and **Expo**, providing a robust solution for both administrative control and on-site guard operations.

## Features

- **Admin Dashboard (`apps/web/app/admin`)**:
  - Comprehensive scheduling management for shifts.
  - Management of Guards, Sites, and Shift Types.
  - **Real-time Monitoring**: Server-Sent Events (SSE) based dashboard for live alerts and active shift tracking.
  - Alert resolution and management (Resolve/Forgive workflows).
- **Employee Interface (`apps/web/app/employee` & `apps/mobile`)**:
  - Mobile-optimized web interface and native Expo app.
  - Secure login and shift viewing.
  - **Strict Check-in System**: Validates check-ins based on time windows and geolocation.
  - Attendance recording with location verification.
- **Automated Monitoring**:
  - Dedicated background worker (`apps/worker`) monitors all active shifts.
  - Automatic alert generation for missed check-ins or attendance.
  - Auto-resolution of alerts upon late check-ins.

## Tech Stack

- **Monorepo:** [TurboRepo](https://turbo.build/repo)
- **Frameworks:** [Next.js 16](https://nextjs.org/) (Web), [Expo](https://expo.dev/) (Mobile)
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** [Prisma](https://www.prisma.io/)
- **Caching & Queue:** Redis (via `ioredis`)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
- **Validation:** [Zod](https://zod.dev/)

## Prerequisites

Ensure you have the following installed:

- **Node.js** (v20 or higher)
- **PostgreSQL**
- **Redis**

## Getting Started

1.  **Clone the repository** and install dependencies from the root:

    ```bash
    corepack enable
    pnpm install
    ```

2.  **Environment Setup**:
    Copy `.example-env` to `.env` in the root (and specifically for `apps/web` if needed) to configure your database and Redis connections.

    ```bash
    cp .example-env .env
    ```

3.  **Database Setup**:
    Generate the Prisma client and push the schema to your database using Turbo:

    ```bash
    # Generate Prisma Client for all packages
    pnpm postinstall

    # Push schema to DB
    pnpm turbo run db:push
    ```

4.  **Run the Application**:
    Start the development environment. This command runs the Next.js app and the background worker concurrently.

    ```bash
    pnpm dev
    ```

    - **Admin Dashboard**: [http://localhost:3000/admin/dashboard](http://localhost:3000/admin/dashboard)
    - **Employee Web Interface**: [http://localhost:3000/employee](http://localhost:3000/employee)

    To also run the mobile app dev server, use:

    ```bash
    pnpm dev:mobile
    ```

## Key Commands

- `pnpm dev`: Starts web and worker in development mode.
- `pnpm dev:mobile`: Starts the mobile app dev server.
- `pnpm build`: Builds all applications for production.
- `pnpm lint`: Runs ESLint and type checking across the entire monorepo.
- `pnpm test`: Executes the test suite.

## Dependency Policy

- Install dependencies from the repository root with `pnpm install`.
- Add app dependencies with workspace filters, for example `pnpm add <pkg> --filter web`.
- Add root-only tooling with `pnpm add -D -w <pkg>`.
- Keep runtime framework dependencies owned by their app workspace, not the root package.

See [docs/DEPENDENCY_POLICY.md](docs/DEPENDENCY_POLICY.md) for the full workspace dependency rules.

## Architecture Overview

The project is structured as a monorepo under the `apps/` and `packages/` directories:

### Applications (`apps/`)

- **`web/`**: The main Next.js 16 application containing the Admin dashboard and Employee web interface.
- **`mobile/`**: The Expo/React Native mobile application for employees/guards in the field.
- **`worker/`**: A dedicated Node.js background process for real-time shift monitoring and alert generation.

### Shared Packages (`packages/`)

- **`database/`**: Prisma schema, migrations, and the shared database client.
- **`shared/`**: Shared TypeScript utilities, constants, and business logic (e.g., scheduling windows).
- **`types/`**: Centralized TypeScript type definitions used across the monorepo.
- **`validations/`**: Shared Zod schemas for form and API validation.
- **`eslint-config/`**: Shared ESLint configuration.
- **`tsconfig/`**: Shared TypeScript configuration.

## Documentation

For more detailed information on the check-in logic and alerting system, please refer to [docs/GUARD_CHECKIN_ALERTING.md](docs/GUARD_CHECKIN_ALERTING.md).
