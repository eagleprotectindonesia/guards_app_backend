import { prisma } from '../src';

const HR_ROLE_NAMES = ['HR', 'Human Resources'];

type RolePolicyShape = {
  employees?: { scope?: 'all' | 'on_site_only' };
  attendance?: { scope?: 'all' | 'shift_only' };
  leaveRequests?: { annualApprover?: 'manager' | 'hr' };
};

async function main() {
  const hrRoles = await prisma.role.findMany({
    where: {
      name: {
        in: HR_ROLE_NAMES,
      },
    },
    select: {
      id: true,
      name: true,
      policy: true,
    },
  });

  if (hrRoles.length === 0) {
    console.log('No HR roles found for backfill.');
    return;
  }

  let updatedCount = 0;

  for (const role of hrRoles) {
    const policy = (role.policy ?? {}) as RolePolicyShape;
    const nextPolicy: RolePolicyShape = {
      employees: policy.employees ?? { scope: 'all' },
      attendance: policy.attendance ?? { scope: 'all' },
      leaveRequests: {
        annualApprover: 'hr',
      },
    };

    const alreadyHr = policy.leaveRequests?.annualApprover === 'hr';
    if (alreadyHr) {
      continue;
    }

    await prisma.role.update({
      where: { id: role.id },
      data: {
        policy: nextPolicy,
      },
    });
    updatedCount += 1;
  }

  console.log(`HR annual approver backfill complete. Updated ${updatedCount} role(s).`);
}

main()
  .catch(error => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
