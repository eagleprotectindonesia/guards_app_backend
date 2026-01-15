import { db as prisma } from '../client';
import { redis } from '../redis';

export async function getAllRoles() {
  return prisma.role.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function getRoleById(id: string) {
  return prisma.role.findUnique({
    where: { id },
    include: {
      permissions: {
        orderBy: { code: 'asc' },
      },
    },
  });
}

export async function getAllPermissions() {
  return prisma.permission.findMany({
    orderBy: { code: 'asc' },
  });
}

export async function createRole(data: { name: string; description?: string; permissionIds: string[] }) {
  return prisma.role.create({
    data: {
      name: data.name,
      description: data.description,
      permissions: {
        connect: data.permissionIds.map(id => ({ id })),
      },
    },
    include: {
      permissions: true,
    },
  });
}

export async function updateRole(
  id: string,
  data: { name: string; description?: string | null; permissionIds: string[] }
) {
  const result = await prisma.$transaction(async tx => {
    const updatedRole = await tx.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        permissions: {
          set: data.permissionIds.map(id => ({ id })),
        },
      },
      include: {
        permissions: true,
      },
    });

    // Find all affected admins
    const admins = await tx.admin.findMany({
      where: { roleId: id },
      select: { id: true },
    });

    if (admins.length > 0) {
      const keys = admins.map(admin => `admin:permissions:${admin.id}`);
      await redis.del(...keys);
    }

    return updatedRole;
  });

  return result;
}

export async function deleteRole(id: string) {
  // Check if it's assigned to any admins first?
  // Prisma will throw if there's a restriction, but let's just do it.
  const adminCount = await prisma.admin.count({
    where: { roleId: id },
  });

  if (adminCount > 0) {
    throw new Error('Cannot delete role that is assigned to active administrators.');
  }

  const role = await prisma.role.findUnique({
    where: { id },
  });

  if (role?.isSystem) {
    throw new Error('Cannot delete system roles.');
  }

  return prisma.role.delete({
    where: { id },
  });
}
