import { PrismaClient, createPrismaClient } from '@repo/database/prisma';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.test'), override: true });

let prisma: PrismaClient;

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set for tests');
    }
    prisma = createPrismaClient(process.env.DATABASE_URL);
  }
  return prisma;
}

export async function cleanDatabase() {
  const prisma = getTestPrisma();

  // Truncate all public tables and restart identities in one deterministic operation.
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE
      stmt text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
      INTO stmt
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations';

      IF stmt IS NOT NULL THEN
        EXECUTE stmt;
      END IF;
    END $$;
  `);
}

export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
  }
}

export async function setupTestDatabase() {
  const prisma = getTestPrisma();
  await prisma.$connect();
  await cleanDatabase();
}

export async function teardownTestDatabase() {
  await cleanDatabase();
  await disconnectDatabase();
}
