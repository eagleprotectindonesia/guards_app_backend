import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { parse, addDays, isBefore } from 'date-fns';

export async function getAllShiftTypes(orderBy: Prisma.ShiftTypeOrderByWithRelationInput = { createdAt: 'desc' }) {
  return prisma.shiftType.findMany({
    orderBy,
  });
}

export async function getShiftTypeById(id: string) {
  return prisma.shiftType.findUnique({
    where: { id },
    include: {
      lastUpdatedBy: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function getPaginatedShiftTypes(params: {
  where?: Prisma.ShiftTypeWhereInput;
  orderBy: Prisma.ShiftTypeOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const [shiftTypes, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.shiftType.findMany({
          where,
          orderBy,
          skip,
          take,
          include: {
            lastUpdatedBy: {
              select: {
                name: true,
              },
            },
          },
        }),
        tx.shiftType.count({ where }),
      ]);
    },
    { timeout: 5000 }
  );

  return { shiftTypes, totalCount };
}

export async function createShiftTypeWithChangelog(data: Prisma.ShiftTypeCreateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const createdShiftType = await tx.shiftType.create({
        data: {
          ...data,
          lastUpdatedById: adminId,
          lastUpdatedBy: undefined,
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'ShiftType',
          entityId: createdShiftType.id,
          adminId: adminId,
          details: {
            name: createdShiftType.name,
            startTime: createdShiftType.startTime,
            endTime: createdShiftType.endTime,
          },
        },
      });

      return createdShiftType;
    },
    { timeout: 5000 }
  );
}

export async function updateShiftTypeWithChangelog(id: string, data: Prisma.ShiftTypeUpdateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const existingShiftType = await tx.shiftType.findUnique({
        where: { id },
      });

      if (!existingShiftType) {
        throw new Error('Shift Type not found');
      }

      const updatedShiftType = await tx.shiftType.update({
        where: { id },
        data: {
          ...data,
          lastUpdatedById: adminId,
          lastUpdatedBy: undefined,
        },
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'ShiftType',
          entityId: updatedShiftType.id,
          adminId: adminId,
          details: {
            name: data.name ? updatedShiftType.name : undefined,
            startTime: data.startTime ? updatedShiftType.startTime : undefined,
            endTime: data.endTime ? updatedShiftType.endTime : undefined,
          },
        },
      });

      const startTime = (data.startTime as string) || existingShiftType.startTime;
      const endTime = (data.endTime as string) || existingShiftType.endTime;
      const timesChanged = existingShiftType.startTime !== startTime || existingShiftType.endTime !== endTime;

      return { updatedShiftType, timesChanged, startTime, endTime };
    },
    { timeout: 5000 }
  );
}

export async function deleteShiftTypeWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const shiftTypeToDelete = await tx.shiftType.findUnique({
        where: { id },
        select: { name: true, id: true },
      });

      if (!shiftTypeToDelete) {
        throw new Error('Shift Type not found');
      }

      // Check for associated shifts
      const relatedShifts = await tx.shift.findFirst({
        where: { shiftTypeId: id },
      });

      if (relatedShifts) {
        throw new Error('Cannot delete shift type: It has associated shifts.');
      }

      await tx.shiftType.delete({
        where: { id },
      });

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'ShiftType',
          entityId: id,
          adminId: adminId,
          details: {
            name: shiftTypeToDelete.name,
            deletedAt: new Date(),
          },
        },
      });
    },
    { timeout: 5000 }
  );
}

export async function updateFutureShifts(shiftTypeId: string, startTime: string, endTime: string) {
  try {
    // Find all unstarted future shifts
    const futureShifts = await prisma.shift.findMany({
      where: {
        shiftTypeId: shiftTypeId,
        status: 'scheduled',
        startsAt: {
          gt: new Date(),
        },
      },
    });

    // Update shifts in parallel
    await Promise.all(
      futureShifts.map(async shift => {
        const dateStr = shift.date.toISOString().split('T')[0];

        const startDateTime = parse(`${dateStr} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date());
        let endDateTime = parse(`${dateStr} ${endTime}`, 'yyyy-MM-dd HH:mm', new Date());

        if (isBefore(endDateTime, startDateTime)) {
          endDateTime = addDays(endDateTime, 1);
        }

        await prisma.shift.update({
          where: { id: shift.id },
          data: {
            startsAt: startDateTime,
            endsAt: endDateTime,
          },
        });
      })
    );
    console.log(`[Background] Updated ${futureShifts.length} future shifts for ShiftType ${shiftTypeId}`);
  } catch (backgroundError) {
    console.error('[Background] Failed to update future shifts:', backgroundError);
  }
}
