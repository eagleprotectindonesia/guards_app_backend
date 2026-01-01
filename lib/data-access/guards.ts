import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { Prisma } from '@prisma/client';
import { isValid, startOfDay, isAfter, isBefore, parseISO } from 'date-fns';

/**
 * Helper to calculate effective status based on join and left dates.
 * If join date is in the future or left date is in the past, status is forced to false.
 */
export function getEffectiveStatus(status: boolean, joinDateVal?: string | Date | null, leftDateVal?: string | Date | null): boolean {
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

export async function getAllGuards(
  orderBy: Prisma.GuardOrderByWithRelationInput = { createdAt: 'desc' },
  includeDeleted = false
) {
  return prisma.guard.findMany({
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

export async function getActiveGuards() {
  return prisma.guard.findMany({
    where: { status: true, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getGuardById(id: string) {
  return prisma.guard.findUnique({
    where: { id, deletedAt: null },
  });
}

export async function findGuardByPhone(phone: string) {
  return prisma.guard.findUnique({
    where: { phone, deletedAt: null },
  });
}

export async function getPaginatedGuards(params: {
  where: Prisma.GuardWhereInput;
  orderBy: Prisma.GuardOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [guards, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.guard.findMany({
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
        tx.guard.count({ where: finalWhere }),
      ]);
    },
    { timeout: 5000 }
  );

  return { guards, totalCount };
}

/**
 * Direct update without changelog. Use sparingly (e.g., system updates).
 */
export async function updateGuard(id: string, data: Prisma.GuardUpdateInput) {
  return prisma.guard.update({
    where: { id, deletedAt: null },
    data,
  });
}

export async function createGuardWithChangelog(data: Prisma.GuardCreateInput, adminId: string) {
  const effectiveStatus = getEffectiveStatus(
    data.status ?? true,
    data.joinDate as Date | string | undefined,
    data.leftDate as Date | string | undefined
  );

  return prisma.$transaction(
    async tx => {
      if (data.guardCode && effectiveStatus) {
        const existing = await tx.guard.findFirst({
          where: {
            guardCode: data.guardCode,
            status: true,
            deletedAt: null,
          },
          select: { id: true },
        });

        if (existing) {
          throw new Error(`DUPLICATE_GUARD_CODE:${existing.id}`);
        }
      }

      const createdGuard = await tx.guard.create({
        data: {
          ...data,
          status: effectiveStatus,
          lastUpdatedBy: { connect: { id: adminId } },
          createdBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Guard',
          entityId: createdGuard.id,
          adminId: adminId,
          details: {
            name: createdGuard.name,
            phone: createdGuard.phone,
            guardCode: createdGuard.guardCode,
            status: createdGuard.status,
            joinDate: createdGuard.joinDate,
            leftDate: createdGuard.leftDate,
            note: createdGuard.note,
          },
        },
      });

      return createdGuard;
    },
    { timeout: 5000 }
  );
}

export async function updateGuardWithChangelog(id: string, data: Prisma.GuardUpdateInput, adminId: string | null) {
  return prisma.$transaction(
    async tx => {
      // If joinDate or leftDate are not in data, we might need them to calculate effective status
      // especially if status is being set to true or if it's a periodic check.

      let joinDate = data.joinDate as Date | string | undefined;
      let leftDate = data.leftDate as Date | string | undefined;
      let status = data.status ;

      if (joinDate === undefined || leftDate === undefined || status === undefined) {
        const current = await tx.guard.findUnique({
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

      if (updateData.guardCode && effectiveStatus) {
        const existing = await tx.guard.findFirst({
          where: {
            guardCode: updateData.guardCode as string,
            status: true,
            deletedAt: null,
            NOT: { id },
          },
          select: { id: true },
        });

        if (existing) {
          throw new Error(`DUPLICATE_GUARD_CODE:${existing.id}`);
        }
      }

      const updatedGuard = await tx.guard.update({
        where: { id },
        data: updateData,
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Guard',
          entityId: updatedGuard.id,
          adminId: adminId,
          details: {
            name: data.name !== undefined ? updatedGuard.name : undefined,
            phone: data.phone !== undefined ? updatedGuard.phone : undefined,
            guardCode: data.guardCode !== undefined ? updatedGuard.guardCode : undefined,
            status: updatedGuard.status,
            joinDate: data.joinDate !== undefined ? updatedGuard.joinDate : undefined,
            leftDate: data.leftDate !== undefined ? updatedGuard.leftDate : undefined,
            note: data.note !== undefined ? updatedGuard.note : undefined,
          },
        },
      });

      // If status was set to false, notify active sessions to logout via Redis
      if (updatedGuard.status === false) {
        try {
          await redis.publish(
            `guard:${updatedGuard.id}`,
            JSON.stringify({
              type: 'session_revoked',
              newTokenVersion: updatedGuard.tokenVersion,
            })
          );
        } catch (error) {
          console.error('Failed to publish session revocation event:', error);
        }
      }

      return updatedGuard;
    },
    { timeout: 5000 }
  );
}

export async function updateGuardPasswordWithChangelog(id: string, hashedPassword: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      await tx.guard.update({
        where: { id },
        data: {
          hashedPassword,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Guard',
          entityId: id,
          adminId: adminId,
          details: { field: 'password', status: 'changed' },
        },
      });
    },
    { timeout: 5000 }
  );
}

export async function deleteGuardWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      // Fetch guard details before deletion to store in log
      const guardToDelete = await tx.guard.findUnique({
        where: { id, deletedAt: null },
        select: { name: true, phone: true, id: true },
      });

      if (!guardToDelete) return;

      await tx.guard.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: false,
          // Append suffix to phone to allow re-registration with same phone
          phone: `${guardToDelete.phone}#deleted#${id}`,
          lastUpdatedBy: { connect: { id: adminId } },
          tokenVersion: { increment: 1 }, // Revoke all sessions
        },
      });

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'Guard',
          entityId: id,
          adminId: adminId,
          details: {
            name: guardToDelete.name,
            phone: guardToDelete.phone,
            deletedAt: new Date(),
          },
        },
      });

      // Notify active sessions to logout via Redis
      try {
        await redis.publish(
          `guard:${id}`,
          JSON.stringify({
            type: 'session_revoked',
          })
        );
      } catch (error) {
        console.error('Failed to publish session revocation event:', error);
      }
    },
    { timeout: 5000 }
  );
}

export async function findExistingGuards(phones: string[], ids: string[]) {
  return prisma.guard.findMany({
    where: {
      OR: [{ phone: { in: phones } }, { id: { in: ids } }],
    },
    select: { phone: true, id: true },
  });
}

export async function bulkCreateGuardsWithChangelog(guardsData: Prisma.GuardCreateManyInput[], adminId: string) {
  const finalData = guardsData.map(g => ({
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
      // Check for duplicate guard codes in the batch
      const activeGuardCodes = finalData
        .filter(g => g.guardCode && g.status === true)
        .map(g => g.guardCode as string);

      if (new Set(activeGuardCodes).size !== activeGuardCodes.length) {
        throw new Error('DUPLICATE_GUARD_CODE_IN_BATCH');
      }

      // Check against existing active guards in DB
      if (activeGuardCodes.length > 0) {
        const existing = await tx.guard.findFirst({
          where: {
            guardCode: { in: activeGuardCodes },
            status: true,
            deletedAt: null,
          },
          select: { guardCode: true, id: true },
        });

        if (existing) {
          throw new Error(`DUPLICATE_GUARD_CODE:${existing.guardCode}:${existing.id}`);
        }
      }

      const createdGuards = await tx.guard.createManyAndReturn({
        data: finalData,
        select: {
          id: true,
          name: true,
          phone: true,
          guardCode: true,
          status: true,
          joinDate: true,
        },
      });

      // Log the creation event for EACH guard so their individual history is complete
      await tx.changelog.createMany({
        data: createdGuards.map(g => ({
          action: 'CREATE', // Treat as standard creation for history consistency
          entityType: 'Guard',
          entityId: g.id,
          adminId: adminId,
          details: {
            method: 'BULK_UPLOAD',
            name: g.name,
            phone: g.phone,
            guardCode: g.guardCode,
            status: g.status,
            joinDate: g.joinDate,
          },
        })),
      });

      return createdGuards;
    },
    { timeout: 15000 }
  );
}
