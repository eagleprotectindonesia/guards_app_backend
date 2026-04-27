import { Prisma } from '@prisma/client';
import { db as prisma } from '../prisma/client';
import { addDays, isBefore, parse } from 'date-fns';
import { deleteOfficeShiftWithChangelog } from './office-shifts';
import { getUserFriendlyPrismaError } from '../utils/prisma-errors';

export async function getOfficeShiftTypeSummaries(
  orderBy: Prisma.OfficeShiftTypeOrderByWithRelationInput = { name: 'asc' }
) {
  return prisma.officeShiftType.findMany({
    where: { deletedAt: null },
    orderBy,
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
    },
  });
}

export async function getOfficeShiftTypeById(id: string) {
  return prisma.officeShiftType.findUnique({
    where: { id, deletedAt: null },
    include: {
      lastUpdatedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

export async function getPaginatedOfficeShiftTypes(params: {
  where?: Prisma.OfficeShiftTypeWhereInput;
  orderBy: Prisma.OfficeShiftTypeOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [officeShiftTypes, totalCount] = await prisma.$transaction(async tx => {
    return Promise.all([
      tx.officeShiftType.findMany({
        where: finalWhere,
        orderBy,
        skip,
        take,
        include: {
          lastUpdatedBy: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
      }),
      tx.officeShiftType.count({ where: finalWhere }),
    ]);
  });

  return { officeShiftTypes, totalCount };
}

export async function createOfficeShiftTypeWithChangelog(data: Prisma.OfficeShiftTypeCreateInput, adminId: string) {
  try {
    return await prisma.$transaction(async tx => {
      const created = await tx.officeShiftType.create({
        data: {
          ...data,
          createdBy: { connect: { id: adminId } },
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'OfficeShiftType',
          entityId: created.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: created.name,
            startTime: created.startTime,
            endTime: created.endTime,
          },
        },
      });

      return created;
    });
  } catch (error) {
    throw new Error(getUserFriendlyPrismaError(error, 'OfficeShiftType'));
  }
}

export async function updateOfficeShiftTypeWithChangelog(
  id: string,
  data: Prisma.OfficeShiftTypeUpdateInput,
  adminId: string
) {
  try {
    return await prisma.$transaction(async tx => {
      const before = await tx.officeShiftType.findUnique({
        where: { id, deletedAt: null },
      });

      if (!before) {
        throw new Error('Office Shift Type not found');
      }

      const updated = await tx.officeShiftType.update({
        where: { id },
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      const changes: Record<string, { from: Prisma.InputJsonValue; to: Prisma.InputJsonValue }> = {};
      const fieldsToTrack = ['name', 'startTime', 'endTime'] as const;
      for (const field of fieldsToTrack) {
        if (before[field] !== updated[field]) {
          changes[field] = {
            from: before[field] as Prisma.InputJsonValue,
            to: updated[field] as Prisma.InputJsonValue,
          };
        }
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'OfficeShiftType',
          entityId: updated.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: updated.name,
            startTime: updated.startTime,
            endTime: updated.endTime,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
          },
        },
      });

      const startTime = (data.startTime as string) || before.startTime;
      const endTime = (data.endTime as string) || before.endTime;
      const timesChanged = before.startTime !== startTime || before.endTime !== endTime;

      return { updatedOfficeShiftType: updated, timesChanged, startTime, endTime };
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Office Shift Type not found') {
      throw error;
    }
    throw new Error(getUserFriendlyPrismaError(error, 'OfficeShiftType'));
  }
}

export async function deleteOfficeShiftTypeWithChangelog(id: string, adminId: string, options?: { force?: boolean }) {
  return prisma.$transaction(async tx => {
    const force = options?.force === true;
    const officeShiftType = await tx.officeShiftType.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, name: true, startTime: true, endTime: true },
    });

    if (!officeShiftType) {
      throw new Error('Office Shift Type not found');
    }

    const relatedShifts = await tx.officeShift.findMany({
      where: { officeShiftTypeId: id, deletedAt: null },
      select: { id: true },
    });

    if (relatedShifts.length > 0 && !force) {
      throw new Error('Cannot delete office shift type: It has associated office shifts.');
    }

    for (const relatedShift of relatedShifts) {
      await deleteOfficeShiftWithChangelog(relatedShift.id, adminId, tx);
    }

    await tx.officeShiftType.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        lastUpdatedBy: { connect: { id: adminId } },
      },
    });

    await tx.changelog.create({
      data: {
        action: 'DELETE',
        entityType: 'OfficeShiftType',
        entityId: id,
        actor: 'admin',
        actorId: adminId,
        details: {
          name: officeShiftType.name,
          startTime: officeShiftType.startTime,
          endTime: officeShiftType.endTime,
          deletedAt: new Date(),
        },
      },
    });
  });
}

export async function updateFutureOfficeShifts(officeShiftTypeId: string, startTime: string, endTime: string) {
  try {
    const futureShifts = await prisma.officeShift.findMany({
      where: {
        officeShiftTypeId,
        status: 'scheduled',
        startsAt: { gt: new Date() },
        deletedAt: null,
      },
    });

    await Promise.all(
      futureShifts.map(async shift => {
        const dateStr = shift.date.toISOString().split('T')[0];
        const startDateTime = parse(`${dateStr} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date());
        let endDateTime = parse(`${dateStr} ${endTime}`, 'yyyy-MM-dd HH:mm', new Date());

        if (isBefore(endDateTime, startDateTime)) {
          endDateTime = addDays(endDateTime, 1);
        }

        await prisma.officeShift.update({
          where: { id: shift.id },
          data: {
            startsAt: startDateTime,
            endsAt: endDateTime,
          },
        });
      })
    );
  } catch (error) {
    console.error('[Background] Failed to update future office shifts:', error);
  }
}
