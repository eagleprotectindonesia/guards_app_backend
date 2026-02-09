import { db as prisma } from "../client";
import { Prisma } from '@prisma/client';

export async function getAllSites(includeDeleted = false) {
  return prisma.site.findMany({
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

export async function getActiveSites() {
  return prisma.site.findMany({
    where: { status: true, deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getPaginatedSites(params: { query?: string; skip: number; take: number }) {
  const { query, skip, take } = params;

  const where: Prisma.SiteWhereInput = {
    deletedAt: null,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { clientName: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [sites, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.site.findMany({
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
        tx.site.count({ where }),
      ]);
    },
    { timeout: 5000 }
  );

  return { sites, totalCount };
}

export async function getSiteById(id: string) {
  return prisma.site.findUnique({
    where: { id, deletedAt: null },
  });
}

export async function createSiteWithChangelog(data: Prisma.SiteCreateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const createdSite = await tx.site.create({
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
          createdBy: { connect: { id: adminId } },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Site',
          entityId: createdSite.id,
          adminId: adminId,
          details: {
            name: createdSite.name,
            clientName: createdSite.clientName,
            address: createdSite.address,
            latitude: createdSite.latitude,
            longitude: createdSite.longitude,
            note: createdSite.note,
          },
        },
      });

      return createdSite;
    },
    { timeout: 5000 }
  );
}

export const SITE_TRACKED_FIELDS = [
  'name',
  'clientName',
  'address',
  'latitude',
  'longitude',
  'status',
  'note',
] as const;

export async function updateSiteWithChangelog(id: string, data: Prisma.SiteUpdateInput, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const beforeSite = await tx.site.findUnique({
        where: { id, deletedAt: null },
      });

      if (!beforeSite) {
        throw new Error('Site not found');
      }

      const updatedSite = await tx.site.update({
        where: { id, deletedAt: null },
        data: {
          ...data,
          lastUpdatedBy: { connect: { id: adminId } },
        },
      });

      // Calculate changes
      const changes: Record<string, { from: any; to: any }> = {};
      const fieldsToTrack = ['name', 'clientName', 'address', 'latitude', 'longitude', 'status', 'note'] as const;

      for (const field of fieldsToTrack) {
        const oldValue = (beforeSite as any)[field];
        const newValue = (updatedSite as any)[field];

        if (oldValue !== newValue) {
          changes[field] = { from: oldValue, to: newValue };
        }
      }

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Site',
          entityId: updatedSite.id,
          adminId: adminId,
          details: {
            name: updatedSite.name,
            clientName: updatedSite.clientName,
            address: updatedSite.address,
            latitude: updatedSite.latitude,
            longitude: updatedSite.longitude,
            status: updatedSite.status,
            note: updatedSite.note,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
          },
        },
      });

      return updatedSite;
    },
    { timeout: 5000 }
  );
}

export async function deleteSiteWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const siteToDelete = await tx.site.findUnique({
        where: { id, deletedAt: null },
        select: { name: true, clientName: true },
      });

      if (!siteToDelete) return;

      await tx.site.update({
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
          entityType: 'Site',
          entityId: id,
          adminId: adminId,
          details: {
            name: siteToDelete.name,
            clientName: siteToDelete.clientName,
            deletedAt: new Date(),
          },
        },
      });
    },
    { timeout: 5000 }
  );
}

export async function checkSiteRelations(id: string) {
  const [shift, alert] = await Promise.all([
    prisma.shift.findFirst({ where: { siteId: id } }),
    prisma.alert.findFirst({ where: { siteId: id } }),
  ]);

  return {
    hasShifts: !!shift,
    hasAlerts: !!alert,
  };
}
