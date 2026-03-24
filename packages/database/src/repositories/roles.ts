import { db as prisma } from '../prisma/client';
import { redis } from '../redis/client';
import { EmployeeVisibilityScope } from '@prisma/client';

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

export async function createRole(data: {
  name: string;
  description?: string;
  employeeVisibilityScope: EmployeeVisibilityScope;
  permissionIds: string[];
}) {
  return prisma.role.create({
    data: {
      name: data.name,
      description: data.description,
      employeeVisibilityScope: data.employeeVisibilityScope,
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
  data: {
    name: string;
    description?: string | null;
    employeeVisibilityScope: EmployeeVisibilityScope;
    permissionIds: string[];
  }
) {
  const result = await prisma.$transaction(async tx => {
    const updatedRole = await tx.role.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        employeeVisibilityScope: data.employeeVisibilityScope,
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
  // Check if it's assigned to any active (unsoftdeleted) admins first
  const activeAdminCount = await prisma.admin.count({
    where: {
      roleId: id,
      deletedAt: null,
    },
  });

  if (activeAdminCount > 0) {
    throw new Error('Cannot delete role that is assigned to active administrators.');
  }

  const role = await prisma.role.findUnique({
    where: { id },
  });

  if (role?.isSystem) {
    throw new Error('Cannot delete system roles.');
  }

  return prisma.$transaction(async tx => {
    // Find all affected (soft-deleted) admins for cache invalidation
    const admins = await tx.admin.findMany({
      where: { roleId: id },
      select: { id: true },
    });

    if (admins.length > 0) {
      const keys = admins.flatMap(admin => [
        `admin:permissions:${admin.id}`,
        `admin:token_version:${admin.id}`,
      ]);
      await redis.del(...keys);

      // Cascade delete these admins
      await tx.admin.deleteMany({
        where: { roleId: id },
      });
    }

    return tx.role.delete({
      where: { id },
    });
  });
}

/**
 * Ensures a permission exists in the database.
 * Auto-creates the permission with parsed resource and action from the code.
 * This is used for developer convenience during development.
 */
export async function ensurePermissionExists(code: string) {
  const [resource, action] = code.split(':');

  return prisma.permission.upsert({
    where: { code },
    update: {},
    create: {
      code,
      resource,
      action,
      description: `Auto-generated permission for ${action} ${resource}`,
    },
  });
}
