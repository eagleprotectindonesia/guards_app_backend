import { db as prisma } from "../client";
import { Prisma } from '@prisma/client';
import { parse, addDays, isBefore, differenceInMinutes } from 'date-fns';

export function getShiftTypeDurationInMins(startTime: string, endTime: string) {
  const dummyDate = '2024-01-01';
  const start = parse(`${dummyDate} ${startTime}`, 'yyyy-MM-dd HH:mm', new Date());
  let end = parse(`${dummyDate} ${endTime}`, 'yyyy-MM-dd HH:mm', new Date());

  if (isBefore(end, start)) {
    end = addDays(end, 1);
  }

  return differenceInMinutes(end, start);
}

export async function getAllShiftTypes(orderBy: Prisma.ShiftTypeOrderByWithRelationInput = { createdAt: 'desc' }) {
  return prisma.shiftType.findMany({
    where: { deletedAt: null },
    orderBy,
  });
}

export async function getShiftTypeById(id: string) {
  return prisma.shiftType.findUnique({
    where: { id, deletedAt: null },
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

export async function getPaginatedShiftTypes(params: {
  where?: Prisma.ShiftTypeWhereInput;
  orderBy: Prisma.ShiftTypeOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [shiftTypes, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.shiftType.findMany({
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
        tx.shiftType.count({ where: finalWhere }),
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
          lastUpdatedBy: { connect: { id: adminId } },
          createdBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'ShiftType',
          entityId: createdShiftType.id,
          actor: 'admin',
          actorId: adminId,
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

export const SHIFT_TYPE_TRACKED_FIELDS = ['name', 'startTime', 'endTime'] as const;

export async function updateShiftTypeWithChangelog(id: string, data: Prisma.ShiftTypeUpdateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const beforeShiftType = await tx.shiftType.findUnique({
        where: { id, deletedAt: null },
      });

      if (!beforeShiftType) {
        throw new Error('Shift Type not found');
      }

      const updatedShiftType = await tx.shiftType.update({
        where: { id },
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      // Calculate changes
      const changes: Record<string, { from: any; to: any }> = {};
      const fieldsToTrack = ['name', 'startTime', 'endTime'] as const;

      for (const field of fieldsToTrack) {
        const oldValue = (beforeShiftType as any)[field];
        const newValue = (updatedShiftType as any)[field];

        if (oldValue !== newValue) {
          changes[field] = { from: oldValue, to: newValue };
        }
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'ShiftType',
          entityId: updatedShiftType.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: updatedShiftType.name,
            startTime: updatedShiftType.startTime,
            endTime: updatedShiftType.endTime,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
          },
        },
      });

      const startTime = (data.startTime as string) || beforeShiftType.startTime;
      const endTime = (data.endTime as string) || beforeShiftType.endTime;
      const timesChanged = beforeShiftType.startTime !== startTime || beforeShiftType.endTime !== endTime;

      return { updatedShiftType, timesChanged, startTime, endTime };
    },
    { timeout: 5000 }
  );
}

export async function deleteShiftTypeWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const shiftTypeToDelete = await tx.shiftType.findUnique({
        where: { id, deletedAt: null },
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

      await tx.shiftType.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'ShiftType',
          entityId: id,
          actor: 'admin',
          actorId: adminId,
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
