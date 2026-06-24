import { db as prisma } from '../prisma/client';
import { Prisma } from '@prisma/client';
type SitePostInput = {
  id?: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  sortOrder?: number;
};

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

export async function getPaginatedSites(params: {
  query?: string;
  skip: number;
  take: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const { query, skip, take, sortBy = 'name', sortOrder = 'asc' } = params;

  const validSortFields = ['name', 'clientName', 'status', 'posts'];
  const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';

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

  const orderBy: Prisma.SiteOrderByWithRelationInput =
    sortBy === 'posts' ? { posts: { _count: sortOrder } } : { [sortField]: sortOrder };

  const [sites, totalCount] = await prisma.$transaction(
    async tx => {
      const sites = await tx.site.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          _count: {
            select: {
              posts: {
                where: {
                  status: true,
                  deletedAt: null,
                },
              },
            },
          },
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
      const totalCount = await tx.site.count({ where });
      return [sites, totalCount] as const;
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

export async function getActiveSitePosts(siteId: string) {
  return prisma.sitePost.findMany({
    where: {
      siteId,
      status: true,
      deletedAt: null,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getSiteByIdWithPosts(id: string) {
  return prisma.site.findUnique({
    where: { id, deletedAt: null },
    include: {
      posts: {
        where: {
          deletedAt: null,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      },
    },
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
          actor: 'admin',
          actorId: adminId,
          details: {
            name: createdSite.name,
            clientName: createdSite.clientName,
            address: createdSite.address,
            latitude: createdSite.latitude,
            longitude: createdSite.longitude,
            note: createdSite.note,
            status: createdSite.status,
          },
        },
      });

      return createdSite;
    },
    { timeout: 5000 }
  );
}

export async function createSiteWithPostsAndChangelog(
  data: Prisma.SiteCreateInput,
  posts: SitePostInput[],
  adminId: string
) {
  return prisma.$transaction(async tx => {
    const createdSite = await tx.site.create({
      data: {
        ...data,
        lastUpdatedBy: { connect: { id: adminId } },
        createdBy: { connect: { id: adminId } },
      },
    });

    await tx.sitePost.createMany({
      data: posts.map((post, index) => ({
        siteId: createdSite.id,
        name: post.name,
        address: post.address,
        latitude: post.latitude,
        longitude: post.longitude,
        sortOrder: post.sortOrder ?? index,
        status: true,
      })),
    });

    await tx.changelog.create({
      data: {
        action: 'CREATE',
        entityType: 'Site',
        entityId: createdSite.id,
        actor: 'admin',
        actorId: adminId,
        details: { name: createdSite.name, postCount: posts.length },
      },
    });
    return createdSite;
  });
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
          actor: 'admin',
          actorId: adminId,
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

export async function updateSiteWithPostsAndChangelog(
  id: string,
  data: Prisma.SiteUpdateInput,
  posts: SitePostInput[],
  adminId: string
) {
  return prisma.$transaction(async tx => {
    const existingPosts = await tx.sitePost.findMany({ where: { siteId: id, deletedAt: null } });
    const updatedSite = await tx.site.update({
      where: { id, deletedAt: null },
      data: {
        ...data,
        lastUpdatedBy: { connect: { id: adminId } },
      },
    });

    for (const [index, post] of posts.entries()) {
      if (post.id) {
        await tx.sitePost.update({
          where: { id: post.id },
          data: {
            name: post.name,
            address: post.address,
            latitude: post.latitude,
            longitude: post.longitude,
            sortOrder: post.sortOrder ?? index,
            status: true,
            deletedAt: null,
          },
        });
      } else {
        await tx.sitePost.create({
          data: {
            siteId: id,
            name: post.name,
            address: post.address,
            latitude: post.latitude,
            longitude: post.longitude,
            sortOrder: post.sortOrder ?? index,
            status: true,
          },
        });
      }
    }

    const incomingIds = new Set(posts.map(p => p.id).filter(Boolean));
    const toSoftDelete = existingPosts.filter(p => !incomingIds.has(p.id));
    if (toSoftDelete.length > 0) {
      await tx.sitePost.updateMany({
        where: { id: { in: toSoftDelete.map(p => p.id) } },
        data: { deletedAt: new Date(), status: false },
      });
    }

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'Site',
        entityId: updatedSite.id,
        actor: 'admin',
        actorId: adminId,
        details: { name: updatedSite.name, postCount: posts.length },
      },
    });

    return updatedSite;
  });
}

export async function deleteSiteWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(
    async tx => {
      const siteToDelete = await tx.site.findUnique({
        where: { id, deletedAt: null },
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
          actor: 'admin',
          actorId: adminId,
          details: {
            name: siteToDelete.name,
            clientName: siteToDelete.clientName,
            address: siteToDelete.address,
            latitude: siteToDelete.latitude,
            longitude: siteToDelete.longitude,
            note: siteToDelete.note,
            status: siteToDelete.status,
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

export async function getTotalClientsCount() {
  const uniqueClients = await prisma.site.findMany({
    where: {
      deletedAt: null,
      NOT: [
        { clientName: null },
        { clientName: '' },
      ],
    },
    distinct: ['clientName'],
    select: {
      clientName: true,
    },
  });
  return uniqueClients.length;
}

export async function getSiteAssignmentDashboardMetrics(now: Date = new Date()) {
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [totalSites, assignedSiteRows] = await Promise.all([
    prisma.site.count({
      where: {
        deletedAt: null,
      },
    }),
    prisma.shift.findMany({
      where: {
        deletedAt: null,
        status: 'scheduled',
        startsAt: {
          gte: now,
          lt: windowEnd,
        },
        site: {
          deletedAt: null,
        },
      },
      distinct: ['siteId'],
      select: {
        siteId: true,
      },
    }),
  ]);

  const assignedSites = assignedSiteRows.length;

  return {
    totalSites,
    assignedSites,
    unassignedSites: totalSites - assignedSites,
  };
}

export async function getClientSiteDashboardMetrics() {
  const [totalSites, activeSites, inactiveSites, totalPosts, activeGeofences, totalClients] = await Promise.all([
    prisma.site.count({ where: { deletedAt: null } }),
    prisma.site.count({ where: { status: true, deletedAt: null } }),
    prisma.site.count({ where: { status: false, deletedAt: null } }),
    prisma.sitePost.count({ where: { status: true, deletedAt: null } }),
    prisma.site.count({ where: { geofenceStatus: true, deletedAt: null } }),
    getTotalClientsCount(),
  ]);

  return {
    totalClients,
    totalSites,
    activeSites,
    inactiveSites,
    totalPosts,
    activeGeofences,
  };
}
