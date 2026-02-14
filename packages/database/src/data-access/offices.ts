import { db as prisma } from "../client";
import { Prisma } from '@prisma/client';

export async function getAllOffices(includeDeleted = false) {
  return prisma.office.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
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

export async function getActiveOffices() {
  return prisma.office.findMany({
    where: { status: true, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getPaginatedOffices(params: { query?: string; skip: number; take: number }) {
  const { query, skip, take } = params;

  const where: Prisma.OfficeWhereInput = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [offices, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.office.findMany({
          where,
          orderBy: { name: 'asc' },
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
        tx.office.count({ where }),
      ]);
    },
    { timeout: 5000 }
  );

  return { offices, totalCount };
}

export async function getOfficeById(id: string) {
  return prisma.office.findUnique({
    where: { id, deletedAt: null },
  });
}

export const OFFICE_TRACKED_FIELDS = [
  'name',
  'address',
  'latitude',
  'longitude',
  'status',
  'note',
] as const;

export async function createOfficeWithChangelog(data: Prisma.OfficeCreateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const createdOffice = await tx.office.create({
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
          createdBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Office',
          entityId: createdOffice.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: createdOffice.name,
            address: createdOffice.address,
            latitude: createdOffice.latitude,
            longitude: createdOffice.longitude,
            note: createdOffice.note,
          },
        },
      });

      return createdOffice;
    },
    { timeout: 5000 }
  );
}

export async function updateOfficeWithChangelog(id: string, data: Prisma.OfficeUpdateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const beforeOffice = await tx.office.findUnique({
        where: { id, deletedAt: null },
      });

      if (!beforeOffice) {
        throw new Error('Office not found');
      }

      const updatedOffice = await tx.office.update({
        where: { id, deletedAt: null },
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      // Calculate changes
      const changes: Record<string, { from: any; to: any }> = {};

      for (const field of OFFICE_TRACKED_FIELDS) {
        const oldValue = (beforeOffice as any)[field];
        const newValue = (updatedOffice as any)[field];

        if (oldValue !== newValue) {
          changes[field] = { from: oldValue, to: newValue };
        }
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Office',
          entityId: updatedOffice.id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: updatedOffice.name,
            address: updatedOffice.address,
            latitude: updatedOffice.latitude,
            longitude: updatedOffice.longitude,
            status: updatedOffice.status,
            note: updatedOffice.note,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
          },
        },
      });

      return updatedOffice;
    },
    { timeout: 5000 }
  );
}

export async function deleteOfficeWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const officeToDelete = await tx.office.findUnique({
        where: { id, deletedAt: null },
        select: { name: true },
      });

      if (!officeToDelete) return;

      await tx.office.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: false,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'Office',
          entityId: id,
          actor: 'admin',
          actorId: adminId,
          details: {
            name: officeToDelete.name,
            deletedAt: new Date(),
          },
        },
      });
    },
    { timeout: 5000 }
  );
}

export async function checkOfficeRelations(id: string) {
  const attendance = await prisma.officeAttendance.findFirst({ where: { officeId: id } });

  return {
    hasAttendance: !!attendance,
  };
}
