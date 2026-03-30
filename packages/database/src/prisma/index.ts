// Prisma Layer - Database client and types
export { PrismaClient, Prisma, createPrismaClient } from './client';
export { db, db as prisma } from './client';
export type {
  ExtendedPrismaClient,
  EmployeeSummary,
  EmployeeWithDerivedOfficeMetadata,
  EmployeeWithRelations,
  EmployeeWithRelationsAndDerived,
  EmployeeWithRelationsAndSchedule,
} from './client';
