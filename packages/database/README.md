# @repo/database

Shared backend package for the monorepo. This package provides server-side persistence, caching, and external service integration.

## Structure

This package is organized into four explicit layers:

### Prisma Layer (`prisma/`)
Database client instantiation and Prisma-specific types:
- `client.ts` - Prisma client creation, singleton pattern, connection pooling
- `index.ts` - Public exports for the Prisma layer

**Exports:**
- `PrismaClient`, `Prisma` - Raw Prisma types and client
- `createPrismaClient()` - Factory for creating new Prisma instances
- `db`, `prisma` - Shared singleton instance
- `ExtendedPrismaClient` - Extended Prisma client type with custom relations
- `EmployeeWithRelations`, `EmployeeSummary` - Domain-specific Prisma types

### Redis Layer (`redis/`)
Redis client for caching and session management:
- `client.ts` - Redis client creation with connection pooling
- `index.ts` - Public exports for the Redis layer

**Exports:**
- `redis` - Shared Redis singleton instance

### Integrations Layer (`integrations/`)
External service clients for outbound API calls:
- `external-employee-api.ts` - Employee data sync from external HR system

**Exports:**
- `ExternalEmployee` - Type for external employee data
- `fetchExternalEmployees()` - Fetch employees from external API

### Repositories Layer (`repositories/`)
Domain-oriented query and mutation helpers. This is the **primary interface** for app code.

**Repositories:**
- `admins.ts` - Admin user operations
- `alerts.ts` - Alert management
- `attendance.ts`, `attendance-with-checkins.ts` - Attendance records
- `chat.ts` - Chat messages and conversation management
- `checkins.ts` - Check-in operations
- `employees.ts` - Employee queries
- `offices.ts`, `office-attendance.ts` - Office management
- `roles.ts` - Role management
- `settings.ts` - Application settings
- `shift-types.ts`, `shifts.ts` - Shift management
- `sites.ts` - Site management

## Usage

### Default: Use Repository Functions

Import repository functions directly for most database operations:

```typescript
// Import specific repository functions
import { getEmployeeById, getAllEmployees } from '@repo/database';

// Use in your code
const employee = await getEmployeeById(id);
```

### Infrastructure Access (when needed)

Access Prisma or Redis directly when you need transactions or custom queries:

```typescript
// Import the database client
import { db } from '@repo/database';

// Use in transactions or custom queries
const result = await db.$transaction(async (tx) => {
  await tx.shift.create({ data: { ... } });
  await tx.attendance.create({ data: { ... } });
});
```

```typescript
// Import Redis
import { redis } from '@repo/database/redis';

// Use for caching
await redis.set(`employee:${id}`, JSON.stringify(data), 'EX', 3600);
```

### External Integrations

```typescript
import { fetchExternalEmployees } from '@repo/database';

const employees = await fetchExternalEmployees();
```

## Guidelines

### What belongs in Repositories
- **Domain queries** - Finding employees, shifts, sites by various criteria
- **Domain mutations** - Creating/updating/deleting domain entities
- **Changelog operations** - Operations that also write to changelog tables
- **Common query patterns** - Queries used by multiple apps (web, worker)

### What belongs in App Code
- **Route handlers** - HTTP request/response handling
- **Auth/session logic** - Authentication flows, session creation
- **Response shaping** - Transforming data for specific UI needs
- **Transaction orchestration** - Multi-step operations specific to one flow

### When to Use Raw Prisma

**Valid reasons to use `db` directly:**
1. **Transactions** - Multi-entity operations that must succeed/fail together
2. **Orchestration-heavy flows** - Complex sequences not worth abstracting
3. **One-off queries** - Queries used only once, not worth promoting to repository
4. **Dynamic queries** - Queries with highly variable where/orderby clauses

**Promote to Repository when:**
- The same Prisma pattern appears 2+ times
- The query represents a clear domain concept
- Multiple apps need the same query

### When to Use Raw Redis

**Valid reasons to use `redis` directly:**
1. **Custom cache keys** - App-specific caching strategies
2. **Pub/Sub** - Redis channel operations
3. **Data structures** - Using Redis hashes, sets, sorted sets
4. **Locking** - Distributed locks for background jobs

## Import Paths

The package supports layered imports for clarity:

```typescript
// Full package exports (most common)
import { getEmployeeById, db } from '@repo/database';
import { redis } from '@repo/database/redis';

// Layer-specific imports (when you need only one layer)
import { db } from '@repo/database/prisma';
import { redis } from '@repo/database/redis';
import { fetchExternalEmployees } from '@repo/database/integrations';
import { getEmployeeById } from '@repo/database/repositories';
```

## Naming Convention

- **Repository functions** use verb-first naming: `getEmployeeById`, `createShift`, `updateAdmin`
- **Types** are PascalCase: `EmployeeWithRelations`, `ExtendedPrismaClient`
- **Clients** are lowercase: `db`, `prisma`, `redis`
