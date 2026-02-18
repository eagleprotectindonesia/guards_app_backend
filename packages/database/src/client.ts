import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Help Next.js find the root .env in a monorepo setup
const rootEnvPath = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  // Try current directory as fallback
  dotenv.config();
}

export { PrismaClient, Prisma };

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const createPrismaClient = (databaseUrl?: string) => {
  const connectionString = databaseUrl || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

  const pool = new Pool({ connectionString });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });
};

const prismaInstance = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;

export const db = prismaInstance;

export type ExtendedPrismaClient = typeof db;

export type EmployeeSummary = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
};

export type EmployeeWithRelations = NonNullable<Prisma.Result<
  typeof db.employee,
  {},
  'findUnique'
>>;
