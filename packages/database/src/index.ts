// ============================================================================
// @repo/database - Shared Backend Package
// ============================================================================
// This package provides shared server-side backend functionality:
// - Prisma client (persistence layer)
// - Redis client (caching/session layer)
// - External integrations (outbound service clients)
// - Repositories (domain-oriented query/mutation helpers)
// ============================================================================

// ============================================================================
// Prisma Layer - Database client and types
// ============================================================================
export { PrismaClient, Prisma, createPrismaClient } from './prisma';
export { db, db as prisma } from './prisma';
export type { ExtendedPrismaClient, EmployeeWithRelations, EmployeeSummary } from './prisma';

// ============================================================================
// Redis Layer - Cache and session storage
// ============================================================================
export { redis } from './redis';

// ============================================================================
// Integrations Layer - External service clients
// ============================================================================
export * from './integrations';

// ============================================================================
// Repositories Layer - Domain-oriented query and mutation helpers
// ============================================================================
export * from './repositories';
