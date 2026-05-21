import { PrismaClient } from '@prisma/client';
import { computeAnnualLeaveEntitledDays } from '../src/repositories/annual-leave-policy';

const prisma = new PrismaClient();

async function main() {
  const year = new Date().getUTCFullYear();
  const employees = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: { id: true, dateOfJoining: true },
  });

  let updatedCount = 0;
  for (const employee of employees) {
    const entitledDays = computeAnnualLeaveEntitledDays({ dateOfJoining: employee.dateOfJoining, year });
    const result = await prisma.employeeAnnualLeaveBalance.upsert({
      where: {
        employeeId_year: {
          employeeId: employee.id,
          year,
        },
      },
      update: { entitledDays },
      create: {
        employeeId: employee.id,
        year,
        entitledDays,
        adjustedDays: 0,
        consumedDays: 0,
      },
    });
    if (result.entitledDays === entitledDays) {
      updatedCount++;
    }
  }

  console.log(`Annual leave entitled-days backfill complete for year=${year}. Processed ${employees.length} employee(s).`);
  console.log(`Rows upserted/updated: ${updatedCount}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
