// ============================================================================
// Persistence Layer (Prisma)
// ============================================================================
export { PrismaClient, Prisma, createPrismaClient } from './client';
export { db, db as prisma } from './client';
export type { ExtendedPrismaClient, EmployeeWithRelations, EmployeeSummary } from './client';

// ============================================================================
// Infrastructure Layer (Redis)
// ============================================================================
export { redis } from './redis';

// ============================================================================
// External Integration Layer
// ============================================================================
export * from './external-employee-api';

// ============================================================================
// Data Access Layer (Domain-specific queries)
// ============================================================================
export * from './data-access/admins';
export * from './data-access/alerts';
export * from './data-access/attendance';
export * from './data-access/attendance-with-checkins';
export * from './data-access/checkins';
export * from './data-access/employees';
export * from './data-access/settings';
export * from './data-access/shift-types';
export * from './data-access/shifts';
export * from './data-access/sites';
export * from './data-access/roles';
export * from './data-access/offices';
export * from './data-access/office-attendance';
