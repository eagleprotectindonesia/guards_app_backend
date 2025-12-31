import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { Prisma } from '@prisma/client';

export async function getAllAdmins(orderBy: Prisma.AdminOrderByWithRelationInput = { createdAt: 'desc' }) {
  return prisma.admin.findMany({
    where: { deletedAt: null },
    orderBy,
  });
}

export async function getAdminById(id: string) {
  return prisma.admin.findUnique({
    where: { id, deletedAt: null },
  });
}

export async function findAdminByEmail(email: string) {
  return prisma.admin.findFirst({
    where: { email, deletedAt: null },
  });
}

export async function getPaginatedAdmins(params: {
  where: Prisma.AdminWhereInput;
  orderBy: Prisma.AdminOrderByWithRelationInput;
  skip: number;
  take: number;
}) {
  const { where, orderBy, skip, take } = params;
  const finalWhere = { ...where, deletedAt: null };

  const [admins, totalCount] = await prisma.$transaction(
    async tx => {
      return Promise.all([
        tx.admin.findMany({
          where: finalWhere,
          orderBy,
          skip,
          take,
        }),
        tx.admin.count({ where: finalWhere }),
      ]);
    },
    { timeout: 5000 }
  );

  return { admins, totalCount };
}

export async function createAdminWithChangelog(data: Prisma.AdminCreateInput, creatorId: string) {
  return prisma.$transaction(
    async tx => {
      const createdAdmin = await tx.admin.create({
        data,
      });

      await tx.changelog.create({
        data: {
          action: 'CREATE',
          entityType: 'Admin',
          entityId: createdAdmin.id,
          adminId: creatorId,
          details: {
            name: createdAdmin.name,
            email: createdAdmin.email,
            role: createdAdmin.role,
          },
        },
      });

      return createdAdmin;
    },
    { timeout: 5000 }
  );
}

export async function updateAdminWithChangelog(id: string, data: Prisma.AdminUpdateInput, modifierId: string) {
  return prisma.$transaction(
    async tx => {
      const updatedAdmin = await tx.admin.update({
        where: { id },
        data,
      });

      await tx.changelog.create({
        data: {
          action: 'UPDATE',
          entityType: 'Admin',
          entityId: updatedAdmin.id,
          adminId: modifierId,
          details: {
            name: data.name ? updatedAdmin.name : undefined,
            email: data.email ? updatedAdmin.email : undefined,
            role: data.role ? updatedAdmin.role : undefined,
            passwordChanged: !!data.hashedPassword,
          },
        },
      });

      // If password was changed, invalidate Redis cache
      if (data.hashedPassword) {
        const cacheKey = `admin:token_version:${id}`;
        await redis.del(cacheKey);
      }

      return updatedAdmin;
    },
    { timeout: 5000 }
  );
}

export async function deleteAdminWithChangelog(id: string, deleterId: string) {
  return prisma.$transaction(
    async tx => {
      const adminToDelete = await tx.admin.findUnique({
        where: { id, deletedAt: null },
        select: { email: true, name: true, role: true },
      });

      if (!adminToDelete) return null;

      const updatedAdmin = await tx.admin.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          email: `${adminToDelete.email}#deleted#${id}`,
          tokenVersion: { increment: 1 },
        },
      });

      await tx.changelog.create({
        data: {
          action: 'DELETE',
          entityType: 'Admin',
          entityId: id,
          adminId: deleterId,
          details: {
            name: adminToDelete.name,
            email: adminToDelete.email,
            deletedAt: new Date(),
          },
        },
      });

      // Invalidate Redis cache for this admin
      const cacheKey = `admin:token_version:${id}`;
      await redis.del(cacheKey);

      return updatedAdmin;
    },
    { timeout: 5000 }
  );
}
