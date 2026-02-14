import { PrismaClient, createPrismaClient } from '@repo/database';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment
// Load test environment with override to ensure test config takes precedence over component side-effects
dotenv.config({ path: path.resolve(__dirname, '../../../.env.test'), override: true });
console.log('Test DATABASE_URL:', process.env.DATABASE_URL);

let prisma: PrismaClient;

/**
 * Get or create Prisma client for tests
 */
export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set for tests');
    }
    prisma = createPrismaClient(process.env.DATABASE_URL);
  }
  return prisma;
}

/**
 * Clean up all data from test database
 * Truncates all tables in reverse dependency order
 */
export async function cleanDatabase() {
  const prisma = getTestPrisma();
  
  // Delete in order to respect foreign key constraints
  await prisma.checkin.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.officeAttendance.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.shiftType.deleteMany();
  await prisma.site.deleteMany();
  await prisma.office.deleteMany();
  await prisma.designation.deleteMany();
  await prisma.department.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.changelog.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.apiKey.deleteMany();
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
  }
}

/**
 * Setup function to run before all tests
 */
export async function setupTestDatabase() {
  const prisma = getTestPrisma();
  
  // Verify connection
  await prisma.$connect();
  
  // Clean database
  await cleanDatabase();
}

/**
 * Teardown function to run after all tests
 */
export async function teardownTestDatabase() {
  await cleanDatabase();
  await disconnectDatabase();
}
