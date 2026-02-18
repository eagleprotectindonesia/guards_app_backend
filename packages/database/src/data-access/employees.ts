import { db as prisma, EmployeeSummary } from '../client';
import { redis } from '../redis';
import { EmployeeRole, Prisma } from '@prisma/client';
import { deleteFutureShiftsByEmployee } from './shifts';

export async function getAllEmployees(
  orderBy: Prisma.EmployeeOrderByWithRelationInput = { createdAt: 'desc' },
  includeDeleted = false
) {
  return prisma.employee.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy,
  });
}

export async function getActiveEmployees(role?: EmployeeRole) {
  return prisma.employee.findMany({
    where: {
      status: true,
      deletedAt: null,
      ...(role && { role }),
    },
    orderBy: { fullName: 'asc' },
  });
}

export async function getActiveEmployeesSummary(role?: EmployeeRole): Promise<EmployeeSummary[]> {
  return prisma.employee.findMany({
    where: {
      status: true,
      deletedAt: null,
      ...(role && { role }),
    },
    orderBy: { fullName: 'asc' },
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
    },
  });
}

export async function getEmployeeById(id: string) {
  return prisma.employee.findUnique({
    where: { id, deletedAt: null },
  });
}

export async function findEmployeeByPhone(phone: string) {
  return prisma.employee.findUnique({
    where: { phone, deletedAt: null },
  });
}

export async function findEmployeeByEmployeeNumber(employeeNumber: string) {
  return prisma.employee.findFirst({
    where: { employeeNumber, deletedAt: null },
  });
}

export async function getPaginatedEmployees(params: {
  where: Prisma.EmployeeWhereInput;
  orderBy: Prisma.EmployeeOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [employees, totalCount] = await prisma.$transaction([
    prisma.employee.findMany({
      where: finalWhere,
      orderBy,
      skip,
      take,
    }),
    prisma.employee.count({ where: finalWhere }),
  ]);

  return { employees, totalCount };
}

/**
 * Upsert an employee from external API data.
 * Does NOT overwrite hashedPassword, tokenVersion, or phone if they already exist, 
 * unless specifically intended (phone comes from external too).
 */
export async function upsertEmployeeFromExternal(data: {
  id: string;
  employeeNumber: string;
  personnelId: string | null;
  nickname: string | null;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  role: EmployeeRole | null;
  phone: string;
  password?: string; // Hashed default password for new employees
}) {
  return prisma.employee.upsert({
    where: { id: data.id },
    create: {
      id: data.id,
      employeeNumber: data.employeeNumber,
      personnelId: data.personnelId,
      nickname: data.nickname,
      fullName: data.fullName,
      jobTitle: data.jobTitle,
      department: data.department,
      phone: data.phone,
      hashedPassword: data.password || '', // Should be provided for new employees
      role: data.role,
      status: true,
    },
    update: {
      employeeNumber: data.employeeNumber,
      personnelId: data.personnelId,
      nickname: data.nickname,
      fullName: data.fullName,
      jobTitle: data.jobTitle,
      department: data.department,
      phone: data.phone,
      role: data.role,
      status: true, // Reactivate if it was deactivated but returned to external list
      deletedAt: null, // Restore if soft-deleted
    },
  });
}

/**
 * Deactivates employees not present in the provided list of IDs.
 * Used at the end of a sync process.
 */
export async function deactivateEmployeesNotIn(activeIds: string[]) {
  return prisma.$transaction(async tx => {
    // 1. Find employees to deactivate
    const toDeactivate = await tx.employee.findMany({
      where: {
        id: { notIn: activeIds },
        status: true,
        deletedAt: null,
      },
      select: { id: true, tokenVersion: true },
    });

    if (toDeactivate.length === 0) return { deactivatedCount: 0 };

    const idsToDeactivate = toDeactivate.map(e => e.id);

    // 2. Bulk update status and increment tokenVersion
    await tx.employee.updateMany({
      where: { id: { in: idsToDeactivate } },
      data: {
        status: false,
        tokenVersion: { increment: 1 },
      },
    });

    // 3. Cleanup future shifts and notify sessions
    for (const employee of toDeactivate) {
      await deleteFutureShiftsByEmployee(employee.id, 'SYSTEM_SYNC', tx);
      
      try {
        const newTokenVersion = (employee.tokenVersion + 1).toString();
        await Promise.all([
          redis.xadd(
            `employee:stream:${employee.id}`,
            'MAXLEN', '~', 100, '*',
            'type', 'session_revoked',
            'newTokenVersion', newTokenVersion
          ),
          redis.set(`employee:${employee.id}:token_version`, newTokenVersion, 'EX', 3600),
        ]);
      } catch (err) {
        console.error(`Failed to notify session revocation for ${employee.id}:`, err);
      }
    }

    return { deactivatedCount: idsToDeactivate.length };
  });
}

export async function createEmployee(data: Prisma.EmployeeCreateInput) {
  return prisma.employee.create({
    data,
  });
}

export async function updateEmployee(id: string, data: Prisma.EmployeeUpdateInput) {
  return prisma.employee.update({
    where: { id },
    data,
  });
}

export async function deleteEmployee(id: string) {
  return prisma.employee.update({
    where: { id },
    data: { 
      deletedAt: new Date(),
      status: false,
    },
  });
}

export async function updateEmployeePasswordWithChangelog(id: string, password: string, adminId: string) {
  return prisma.$transaction(async tx => {
    await tx.employee.update({
      where: { id },
      data: { hashedPassword: password },
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'Employee',
        entityId: id,
        actor: 'admin',
        actorId: adminId,
        details: { field: 'password', status: 'changed' },
      },
    });
  });
}
