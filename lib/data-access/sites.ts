import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function getAllSites() {
  return prisma.site.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function getPaginatedSites(params: {
  query?: string;
  skip: number;
  take: number;
}) {
  const { query, skip, take } = params;

  const where: Prisma.SiteWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { clientName: { contains: query, mode: 'insensitive' } },
        ],
      }
    : {};

  const [sites, totalCount] = await prisma.$transaction([
    prisma.site.findMany({
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
      },
    }),
    prisma.site.count({ where }),
  ]);

  return { sites, totalCount };
}

export async function getSiteById(id: string) {
  return prisma.site.findUnique({
    where: { id },
  });
}

export async function createSiteWithChangelog(data: Prisma.SiteCreateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const createdSite = await tx.site.create({
      data: {
        ...data,
        lastUpdatedById: adminId,
        lastUpdatedBy: undefined,
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
        },
      },
    });

    return createdSite;
  });
}

export async function updateSiteWithChangelog(id: string, data: Prisma.SiteUpdateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const updatedSite = await tx.site.update({
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
        entityType: 'Site',
        entityId: updatedSite.id,
        adminId: adminId,
        details: {
          name: data.name ? updatedSite.name : undefined,
          clientName: data.clientName ? updatedSite.clientName : undefined,
          address: data.address ? updatedSite.address : undefined,
          latitude: data.latitude ? updatedSite.latitude : undefined,
          longitude: data.longitude ? updatedSite.longitude : undefined,
        },
      },
    });

    return updatedSite;
  });
}

export async function deleteSiteWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(async tx => {
    const siteToDelete = await tx.site.findUnique({
      where: { id },
      select: { name: true, clientName: true },
    });

    await tx.site.delete({
      where: { id },
    });

    if (siteToDelete) {
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
    }
  });
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
