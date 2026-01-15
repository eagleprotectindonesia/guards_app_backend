# EP Guard Scheduling - Gemini Context

## Project Overview
**EP Guard Scheduling** is a full-stack monorepo application for managing security guard schedules, tracking attendance, and monitoring real-time check-ins. It features a Next.js web application (Admin + Guard views), a React Native mobile app, and a background worker for automated monitoring and alerting.

## Tech Stack
-   **Monorepo Tool:** TurboRepo
-   **Web Framework:** Next.js 16 (App Router)
-   **Mobile Framework:** Expo / React Native
-   **Language:** TypeScript
-   **Database:** PostgreSQL (via Prisma ORM)
-   **Caching/Queue:** Redis (ioredis)
-   **UI Library:** Tailwind CSS v4, Radix UI
-   **Validation:** Zod (in `@repo/validations`)
-   **Maps:** Google Maps Integration

## Repository Structure
-   `apps/web`: Next.js application containing:
    -   `/admin`: Administrative dashboard (Scheduling, Real-time Monitoring).
    -   `/guard`: Web-based Guard interface (Attendance, Check-ins).
    -   `/api`: Backend Route Handlers.
-   `apps/mobile`: Expo/React Native mobile application for guards.
-   `worker`: Dedicated Node.js background process for monitoring shifts and generating alerts.
-   `packages/`: Shared internal packages.
    -   `database`: Prisma schema and client configuration.
    -   `shared`: Shared utilities and constants.
    -   `types`: Shared TypeScript definitions.
    -   `validations`: Shared Zod validation schemas.

## Key Commands
Run these from the project root:

-   **Start Development:** `npm run dev` (Starts Web, Worker, and potentially Mobile via Turbo)
-   **Build:** `npm run build`
-   **Lint:** `npm run lint`
-   **Database (Prisma):**
    -   Generate Client: `npx turbo run prisma:generate` (or `npx prisma generate` inside `packages/database`)
    -   Push Schema: `npx turbo run db:push` (or `npx prisma db push` inside `packages/database`)

## Critical Business Logic
Refer to `GUARD_CHECKIN_ALERTING.md` for detailed logic on:
-   **Shift Lifecycle:** Scheduled -> In Progress -> Completed/Missed.
-   **Attendance:** Initial clock-in validation (Location & Time).
-   **Check-ins:** Recurring heartbeats with strict time windows (Open, Early, Late).
-   **Alerting:** Automated creation of `missed_checkin` or `missed_attendance` alerts by the Worker.

## Development Conventions
-   **Package Manager:** Uses `npm` with `turbo`.
-   **Database:** Always update `packages/database/prisma/schema.prisma` for DB changes and run generation.
-   **Styling:** Use Tailwind CSS utility classes.
-   **State Management:** Server-state first (React Server Components), client state via hooks/context where necessary.
-   **Real-time:** Uses Server-Sent Events (SSE) for admin dashboard updates.
-   **Next.js Proxy:** This project uses `proxy.ts` (Next.js 16+ convention) instead of `middleware.ts` for request interception and auth verification.

## Important Files
-   `GUARD_CHECKIN_ALERTING.md`: **MUST READ** for any changes to check-in/alert logic.
-   `apps/web/worker.ts` (or `worker/src/worker.ts`): The monitoring loop logic.
-   `packages/database/prisma/schema.prisma`: The source of truth for the data model.
