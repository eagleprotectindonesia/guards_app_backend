import { db as prisma, EmployeeSummary } from '../client';
import { redis } from '../redis';
import { EmployeeRole, Prisma } from '@prisma/client';
import { deleteFutureShiftsByEmployee, cancelInProgressShiftsForDeactivatedEmployee } from './shifts';
import { hashPassword } from '@repo/shared';
import { fetchExternalEmployees } from '../external-employee-api';

const LAST_EMPLOYEE_SYNC_KEY = 'employee:sync:last_timestamp';

export async function getLastEmployeeSyncTimestamp(): Promise<string | null> {
  return redis.get(LAST_EMPLOYEE_SYNC_KEY);
}

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
 *
 * For each deactivated employee:
 * - Future shifts are soft-deleted
 * - In-progress shifts are cancelled
 * - All active alerts are resolved
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

    // 3. Process each deactivated employee
    for (const employee of toDeactivate) {
      // 3a. Delete future shifts
      await deleteFutureShiftsByEmployee(employee.id, tx);

      // 3b. Cancel in-progress shifts (this also resolves alerts for those shifts)
      await cancelInProgressShiftsForDeactivatedEmployee(employee.id, tx);

      // 3c. Resolve any remaining open alerts (for completed/other shifts)
      const now = new Date();
      const remainingAlertsResult = await tx.alert.updateMany({
        where: {
          shift: {
            employeeId: employee.id,
          },
          resolvedAt: null,
        },
        data: {
          resolvedAt: now,
          resolutionType: 'auto',
          resolutionNote: 'Auto-resolved: Employee deactivated.',
        },
      });

      // 3d. Notify employee session revocation via Redis stream
      try {
        const newTokenVersion = (employee.tokenVersion + 1).toString();
        await Promise.all([
          redis.xadd(
            `employee:stream:${employee.id}`,
            'MAXLEN',
            '~',
            100,
            '*',
            'type',
            'session_revoked',
            'newTokenVersion',
            newTokenVersion
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

/**
 * Sync employees from external API.
 * Returns counts of added, updated, and deactivated employees.
 */
export async function syncEmployeesFromExternal() {
  // 1. Fetch from external API
  const externalEmployees = await fetchExternalEmployees();
  console.log(`[SyncEmployees] Fetched ${externalEmployees.length} employees from external API`);

  const externalIds = externalEmployees.map(e => e.id);

  // 2. Fetch existing employees to avoid unnecessary hashing
  const existingEmployees = await prisma.employee.findMany({
    where: { id: { in: externalIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingEmployees.map(e => e.id));

  let addedCount = 0;
  let updatedCount = 0;

  for (const ext of externalEmployees) {
    const isSecurityDepartment = ext.department?.toLowerCase().includes('security') ?? false;
    const role: EmployeeRole = isSecurityDepartment && !ext.office_id ? 'on_site' : 'office';

    if (!existingIds.has(ext.id)) {
      // New employee: use personnel_id as default password
      const defaultPassword = ext.personnel_id || '123456';
      const hashedPassword = await hashPassword(defaultPassword);

      await upsertEmployeeFromExternal({
        id: ext.id,
        employeeNumber: ext.employee_number,
        personnelId: ext.personnel_id,
        nickname: ext.nickname,
        fullName: ext.full_name,
        jobTitle: ext.job_title,
        department: ext.department,
        phone: '',
        password: hashedPassword,
        role,
      });
      addedCount++;
    } else {
      // Existing employee: only update profile fields
      await upsertEmployeeFromExternal({
        id: ext.id,
        employeeNumber: ext.employee_number,
        personnelId: ext.personnel_id,
        nickname: ext.nickname,
        fullName: ext.full_name,
        jobTitle: ext.job_title,
        department: ext.department,
        role,
        phone: '',
      });
      updatedCount++;
    }
  }

  // 3. Deactivate those not in external list
  const { deactivatedCount } = await deactivateEmployeesNotIn(externalIds);

  console.log(
    `[SyncEmployees] Sync completed: ${addedCount} added, ${updatedCount} updated, ${deactivatedCount} deactivated`
  );

  // 4. Update last sync timestamp in Redis
  try {
    await redis.set(LAST_EMPLOYEE_SYNC_KEY, new Date().toISOString());
  } catch (err) {
    console.error('[SyncEmployees] Failed to update last sync timestamp:', err);
  }

  return {
    added: addedCount,
    updated: updatedCount,
    deactivated: deactivatedCount,
  };
}
