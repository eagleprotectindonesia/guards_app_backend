import { db as prisma } from '../client';
import { redis } from '../redis';
import { Prisma } from '@prisma/client';
import { isValid, startOfDay, isAfter, isBefore, parseISO } from 'date-fns';

/**
 * Helper to calculate effective status based on join and left dates.
 * If join date is in the future or left date is in the past, status is forced to false.
 */
export function getEffectiveStatus(
  status: boolean,
  joinDateVal?: string | Date | null,
  leftDateVal?: string | Date | null
): boolean {
  if (!status) return false;
  const today = startOfDay(new Date());

  const normalize = (val: string | Date) => {
    if (val instanceof Date) return startOfDay(val);
    return startOfDay(parseISO(val.toString()));
  };

  if (joinDateVal) {
    const joinDate = normalize(joinDateVal);
    if (isValid(joinDate) && isAfter(joinDate, today)) return false;
  }

  if (leftDateVal) {
    const leftDate = normalize(leftDateVal);
    if (isValid(leftDate) && isBefore(leftDate, today)) return false;
  }

  return true;
}

export async function getAllEmployees(
  orderBy: Prisma.EmployeeOrderByWithRelationInput = { createdAt: 'desc' },
  includeDeleted = false
) {
  return prisma.employee.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy,
    include: {
      lastUpdatedBy: {
        select: {
          name: true,
        },
      },
      createdBy: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function getActiveEmployees() {
  return prisma.employee.findMany({
    where: { status: true, deletedAt: null },
    orderBy: { name: 'asc' },
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

export async function getPaginatedEmployees(params: {
  where: Prisma.EmployeeWhereInput;
  orderBy: Prisma.EmployeeOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [employees, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.employee.findMany({
          where: finalWhere,
          orderBy,
          skip,
          take,
          include: {
            lastUpdatedBy: {
              select: {
                name: true,
              },
            },
            createdBy: {
              select: {
                name: true,
              },
            },
          },
        }),
        tx.employee.count({ where: finalWhere }),
      ]);
    },
    { timeout: 5000 }
  );

  return { employees, totalCount };
}

/**
 * Direct update without changelog. Use sparingly (e.g., system updates).
 */
export async function updateEmployee(id: string, data: Prisma.EmployeeUpdateInput) {
  return prisma.employee.update({
    where: { id, deletedAt: null },
    data,
  });
}

export async function createEmployeeWithChangelog(data: Prisma.EmployeeCreateInput, adminId: string) {
  const effectiveStatus = getEffectiveStatus(
    data.status ?? true,
    data.joinDate as Date | string | undefined,
    data.leftDate as Date | string | undefined
  );

  return prisma.$transaction(
    async tx => {
      const code = data.employeeCode;
      if (code && effectiveStatus) {
        const existing = await tx.employee.findFirst({
          where: {
            employeeCode: code,
            status: true,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (existing) {
          throw new Error(`DUPLICATE_EMPLOYEE_CODE:${existing.id}`);
        }
      }

      const createdEmployee = await tx.employee.create({
        data: {
          ...data,
          status: effectiveStatus,
          lastUpdatedBy: { connect: { id: adminId } },
          createdBy: { connect: { id: adminId } },
        },
      });

      // Set Redis flag for password change requirement
      await redis.set(`employee:${createdEmployee.id}:must-change-password`, '1');

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Employee',
          entityId: createdEmployee.id,
          adminId: adminId,
          details: {
            name: createdEmployee.name,
            phone: createdEmployee.phone,
            employeeCode: createdEmployee.employeeCode,
            status: createdEmployee.status,
            joinDate: createdEmployee.joinDate,
            leftDate: createdEmployee.leftDate,
            note: createdEmployee.note,
          },
        },
      });

      return createdEmployee;
    },
    { timeout: 5000 }
  );
}

export async function updateEmployeeWithChangelog(id: string, data: Prisma.EmployeeUpdateInput, adminId: string | null) {
  return prisma.$transaction(
    async tx => {
      // If joinDate or leftDate are not in data, we might need them to calculate effective status
      // especially if status is being set to true or if it's a periodic check.

      let joinDate = data.joinDate as Date | string | undefined;
      let leftDate = data.leftDate as Date | string | undefined;
      let status = data.status;

      if (joinDate === undefined || leftDate === undefined || status === undefined) {
        const current = await tx.employee.findUnique({
          where: { id },
          select: { joinDate: true, leftDate: true, status: true },
        });
        if (current) {
          if (joinDate === undefined) joinDate = current.joinDate ?? undefined;
          if (leftDate === undefined) leftDate = current.leftDate ?? undefined;
          if (status === undefined) status = current.status;
        }
      }

      const effectiveStatus = getEffectiveStatus((status as boolean | undefined) ?? true, joinDate, leftDate);

      // If status is being set to false (or calculated as false), increment tokenVersion to revoke sessions
      const updateData = {
        ...data,
        status: effectiveStatus,
      };

      if (adminId) {
        updateData.lastUpdatedBy = { connect: { id: adminId } };
      }

      if (effectiveStatus === false) {
        updateData.tokenVersion = { increment: 1 };
      }

      const code = updateData.employeeCode;
      if (code && effectiveStatus) {
        const existing = await tx.employee.findFirst({
          where: {
            employeeCode: code as string,
            status: true,
            deletedAt: null,
            NOT: { id },
          },
          select: { id: true },
        });

        if (existing) {
          throw new Error(`DUPLICATE_EMPLOYEE_CODE:${existing.id}`);
        }
      }

      const updatedEmployee = await tx.employee.update({
        where: { id },
        data: updateData,
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Employee',
          entityId: updatedEmployee.id,
          adminId: adminId,
          details: {
            name: data.name !== undefined ? updatedEmployee.name : undefined,
            phone: data.phone !== undefined ? updatedEmployee.phone : undefined,
            employeeCode: data.employeeCode !== undefined ? updatedEmployee.employeeCode : undefined,
            status: updatedEmployee.status,
            joinDate: data.joinDate !== undefined ? updatedEmployee.joinDate : undefined,
            leftDate: data.leftDate !== undefined ? updatedEmployee.leftDate : undefined,
            note: data.note !== undefined ? updatedEmployee.note : undefined,
          },
        },
      });

      // If status was set to false, notify active sessions to logout via Redis Stream
      if (updatedEmployee.status === false) {
        try {
          await Promise.all([
            redis.xadd(
              `employee:stream:${updatedEmployee.id}`,
              'MAXLEN',
              '~',
              100,
              '*',
              'type',
              'session_revoked',
              'newTokenVersion',
              updatedEmployee.tokenVersion.toString()
            ),
            // Update cache for high-frequency polling
            redis.set(`employee:${updatedEmployee.id}:token_version`, updatedEmployee.tokenVersion.toString(), 'EX', 3600),
          ]);
        } catch (error) {
          console.error('Failed to notify session revocation:', error);
        }
      }

      return updatedEmployee;
    },
    { timeout: 5000 }
  );
}

export async function updateEmployeePasswordWithChangelog(id: string, hashedPassword: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      await tx.employee.update({
        where: { id },
        data: {
          hashedPassword,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Employee',
          entityId: id,
          adminId: adminId,
          details: { field: 'password', status: 'changed' },
        },
      });
    },
    { timeout: 5000 }
  );
}

export async function deleteEmployeeWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      // Fetch employee details before deletion to store in log
      const employeeToDelete = await tx.employee.findUnique({
        where: { id, deletedAt: null },
        select: { name: true, phone: true, id: true },
      });

      if (!employeeToDelete) return;

      await tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: false,
          // Append suffix to phone to allow re-registration with same phone
          phone: `${employeeToDelete.phone}#deleted#${id}`,
          lastUpdatedBy: { connect: { id: adminId } },
          tokenVersion: { increment: 1 }, // Revoke all sessions
        },
      });

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'Employee',
          entityId: id,
          adminId: adminId,
          details: {
            name: employeeToDelete.name,
            phone: employeeToDelete.phone,
            deletedAt: new Date(),
          },
        },
      });

      // Notify active sessions to logout via Redis Stream and cleanup flags
      try {
        await Promise.all([
          redis.del(`employee:${id}:must-change-password`),
          redis.del(`employee:${id}:token_version`),
          redis.xadd(`employee:stream:${id}`, 'MAXLEN', '~', 100, '*', 'type', 'session_revoked', 'reason', 'deleted'),
        ]);
      } catch (error) {
        console.error('Failed to perform Redis cleanup/notification:', error);
      }
    },
    { timeout: 5000 }
  );
}

export async function findExistingEmployees(phones: string[], ids: string[]) {
  return prisma.employee.findMany({
    where: {
      OR: [{ phone: { in: phones } }, { id: { in: ids } }],
    },
    select: { phone: true, id: true },
  });
}

export async function bulkCreateEmployeesWithChangelog(employeesData: Prisma.EmployeeCreateManyInput[], adminId: string) {
  const finalData = employeesData.map(g => ({
    ...g,
    status: getEffectiveStatus(
      g.status ?? true,
      g.joinDate as Date | string | undefined,
      g.leftDate as Date | string | undefined
    ),
    createdById: adminId,
    lastUpdatedById: adminId,
  }));

  return prisma.$transaction(
    async tx => {
      // Check for duplicate employee codes in the batch
      const activeEmployeeCodes = finalData.filter(g => g.employeeCode && g.status === true).map(g => g.employeeCode as string);

      if (new Set(activeEmployeeCodes).size !== activeEmployeeCodes.length) {
        throw new Error('DUPLICATE_EMPLOYEE_CODE_IN_BATCH');
      }

      // Check against existing active employees in DB
      if (activeEmployeeCodes.length > 0) {
        const existing = await tx.employee.findFirst({
          where: {
            employeeCode: { in: activeEmployeeCodes },
            status: true,
            deletedAt: null,
          },
          select: { employeeCode: true, id: true },
        });

        if (existing) {
          throw new Error(`DUPLICATE_EMPLOYEE_CODE:${existing.employeeCode}:${existing.id}`);
        }
      }

      const createdEmployees = await tx.employee.createManyAndReturn({
        data: finalData,
        select: {
          id: true,
          name: true,
          phone: true,
          employeeCode: true,
          status: true,
          joinDate: true,
        },
      });

      // Set Redis flag for password change requirement for each created employee
      for (const g of createdEmployees) {
        await redis.set(`employee:${g.id}:must-change-password`, '1');
      }

      // Log the creation event for EACH employee so their individual history is complete
      await tx.changelog.createMany({
        data: createdEmployees.map(g => ({
          action: 'CREATE', // Treat as standard creation for history consistency
          entityType: 'Employee',
          entityId: g.id,
          adminId: adminId,
          details: {
            method: 'BULK_UPLOAD',
            name: g.name,
            phone: g.phone,
            employeeCode: g.employeeCode,
            status: g.status,
            joinDate: g.joinDate,
          },
        })),
      });

      return createdEmployees;
    },
    { timeout: 15000 }
  );
}

// --- Backward Compatibility Aliases ---

/** @deprecated Use getAllEmployees */
export const getAllGuards = getAllEmployees;
/** @deprecated Use getActiveEmployees */
export const getActiveGuards = getActiveEmployees;
/** @deprecated Use getEmployeeById */
export const getGuardById = getEmployeeById;
/** @deprecated Use findEmployeeByPhone */
export const findGuardByPhone = findEmployeeByPhone;
/** @deprecated Use getPaginatedEmployees */
export const getPaginatedGuards = getPaginatedEmployees;
/** @deprecated Use updateEmployee */
export const updateGuard = updateEmployee;
/** @deprecated Use createEmployeeWithChangelog */
export const createGuardWithChangelog = createEmployeeWithChangelog;
/** @deprecated Use updateEmployeeWithChangelog */
export const updateGuardWithChangelog = updateEmployeeWithChangelog;
/** @deprecated Use updateEmployeePasswordWithChangelog */
export const updateGuardPasswordWithChangelog = updateEmployeePasswordWithChangelog;
/** @deprecated Use deleteEmployeeWithChangelog */
export const deleteGuardWithChangelog = deleteEmployeeWithChangelog;
/** @deprecated Use findExistingEmployees */
export const findExistingGuards = findExistingEmployees;
/** @deprecated Use bulkCreateEmployeesWithChangelog */
export const bulkCreateGuardsWithChangelog = bulkCreateEmployeesWithChangelog;
