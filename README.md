# EP Guard Scheduling

**EP Guard Scheduling** is a comprehensive Full-Stack monorepo application designed for managing security guard schedules, tracking attendance, and monitoring real-time check-ins. It is managed with **TurboRepo** and built with **Next.js 16 (App Router)** and **Expo**, providing a robust solution for both administrative control and on-site guard operations.

## Features

-   **Admin Dashboard (`apps/web/app/admin`)**:
    -   Comprehensive scheduling management for shifts.
    -   Management of Guards, Sites, and Shift Types.
    -   **Real-time Monitoring**: Server-Sent Events (SSE) based dashboard for live alerts and active shift tracking.
    -   Alert resolution and management (Resolve/Forgive workflows).
-   **Guard Interface (`apps/web/app/guard` & `apps/mobile`)**:
    -   Mobile-optimized web interface and native Expo app.
    -   Secure login and shift viewing.
    -   **Strict Check-in System**: Validates check-ins based on time windows and geolocation.
    -   Attendance recording with location verification.
-   **Automated Monitoring**:
    -   Dedicated background worker (`apps/worker`) monitors all active shifts.
    -   Automatic alert generation for missed check-ins or attendance.
    -   Auto-resolution of alerts upon late check-ins.

## Tech Stack

-   **Monorepo:** [TurboRepo](https://turbo.build/repo)
-   **Frameworks:** [Next.js 16](https://nextjs.org/) (Web), [Expo](https://expo.dev/) (Mobile)
-   **Language:** TypeScript
-   **Database:** PostgreSQL
-   **ORM:** [Prisma](https://www.prisma.io/)
-   **Caching & Queue:** Redis (via `ioredis`)
-   **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/)
-   **Validation:** [Zod](https://zod.dev/)

## Prerequisites

Ensure you have the following installed:

-   **Node.js** (v20 or higher)
-   **PostgreSQL**
-   **Redis**

## Getting Started

1.  **Clone the repository** and install dependencies from the root:

    ```bash
    npm install
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
    npm run postinstall

    # Push schema to DB
    npx turbo run db:push
    ```

4.  **Run the Application**:
    Start the development environment. This command runs the Next.js app, the background worker, and the mobile dev server concurrently.

    ```bash
    npm run dev
    ```

    -   **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)
    -   **Guard Web Interface**: [http://localhost:3000/guard](http://localhost:3000/guard)

## Key Commands

-   `npm run dev`: Starts all applications in development mode.
-   `npm run build`: Builds all applications for production.
-   `npm run lint`: Runs ESLint and type checking across the entire monorepo.
-   `npm run test`: Executes the test suite.

## Architecture Overview

The project is structured as a monorepo under the `apps/` and `packages/` directories:

### Applications (`apps/`)
-   **`web/`**: The main Next.js 16 application containing the Admin dashboard and Guard web interface.
-   **`mobile/`**: The Expo/React Native mobile application for guards.
-   **`worker/`**: A dedicated Node.js background process for real-time shift monitoring and alert generation.

### Shared Packages (`packages/`)
-   **`database/`**: Prisma schema, migrations, and the shared database client.
-   **`shared/`**: Shared TypeScript utilities, constants, and business logic (e.g., scheduling windows).
-   **`types/`**: Centralized TypeScript type definitions used across the monorepo.
-   **`validations/`**: Shared Zod schemas for form and API validation.
-   **`ui/`**: Shared UI component library.

## Documentation

For more detailed information on the check-in logic and alerting system, please refer to [GUARD_CHECKIN_ALERTING.md](GUARD_CHECKIN_ALERTING.md).
