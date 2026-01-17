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

const createPrismaClient = () => {
  const connectionString = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/postgres";

  const pool = new Pool({ connectionString });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });
};

const prismaInstance = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;

export const db = prismaInstance.$extends({
  result: {
    employee: {
      fullName: {
        needs: { firstName: true, lastName: true },
        compute(employee) {
          return `${employee.firstName} ${employee.lastName || ''}`.trim();
        },
      },
    },
  },
});

export type ExtendedPrismaClient = typeof db;

export type ExtendedEmployee = NonNullable<Prisma.Result<typeof db.employee, {}, 'findUnique'>>;

export type EmployeeWithRelations = NonNullable<Prisma.Result<
  typeof db.employee,
  {
    include: {
      department: { select: { id: true; name: true } };
      designation: { select: { id: true; name: true } };
      office: { select: { id: true; name: true } };
      lastUpdatedBy: { select: { name: true } };
      createdBy: { select: { name: true } };
    };
  },
  'findUnique'
>>;
