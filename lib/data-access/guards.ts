import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function getAllGuards(orderBy: Prisma.GuardOrderByWithRelationInput = { createdAt: 'desc' }) {
  return prisma.guard.findMany({
    orderBy,
  });
}

export async function getActiveGuards() {
  return prisma.guard.findMany({
    where: { status: true },
    orderBy: { name: 'asc' },
  });
}

export async function getGuardById(id: string) {
  return prisma.guard.findUnique({
    where: { id },
  });
}

export async function findGuardByPhone(phone: string) {
  return prisma.guard.findUnique({
    where: { phone },
  });
}

export async function getPaginatedGuards(params: {
  where: Prisma.GuardWhereInput;
  orderBy: Prisma.GuardOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [guards, totalCount] = await prisma.$transaction([
    prisma.guard.findMany({
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
    prisma.guard.count({ where }),
  ]);

  return { guards, totalCount };
}

/**
 * Direct update without changelog. Use sparingly (e.g., system updates).
 */
export async function updateGuard(id: string, data: Prisma.GuardUpdateInput) {
  return prisma.guard.update({
    where: { id },
    data,
  });
}

export async function createGuardWithChangelog(data: Prisma.GuardCreateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const createdGuard = await tx.guard.create({
      data: {
        ...data,
        lastUpdatedById: adminId,
        lastUpdatedBy: undefined,
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
  });
}

export async function updateGuardWithChangelog(id: string, data: Prisma.GuardUpdateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const updatedGuard = await tx.guard.update({
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
        entityType: 'Guard',
        entityId: updatedGuard.id,
        adminId: adminId,
        details: {
          name: data.name ? updatedGuard.name : undefined,
          phone: data.phone ? updatedGuard.phone : undefined,
          guardCode: data.guardCode ? updatedGuard.guardCode : undefined,
          status: data.status ? updatedGuard.status : undefined,
          joinDate: data.joinDate ? updatedGuard.joinDate : undefined,
          leftDate: data.leftDate ? updatedGuard.leftDate : undefined,
          note: data.note ? updatedGuard.note : undefined,
        },
      },
    });

    return updatedGuard;
  });
}

export async function updateGuardPasswordWithChangelog(id: string, hashedPassword: string, adminId: string) {
  return prisma.$transaction(async tx => {
    await tx.guard.update({
      where: { id },
      data: { hashedPassword, lastUpdatedById: adminId },
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
  });
}

export async function deleteGuardWithChangelog(id: string, adminId: string) {
  return prisma.$transaction(async tx => {
    // Fetch guard details before deletion to store in log
    const guardToDelete = await tx.guard.findUnique({
      where: { id },
      select: { name: true, phone: true, id: true },
    });

    await tx.guard.delete({
      where: { id },
    });

    if (guardToDelete) {
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
    }
  });
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
  return prisma.$transaction(async tx => {
    const createdGuards = await tx.guard.createManyAndReturn({
      data: guardsData,
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
  });
}
