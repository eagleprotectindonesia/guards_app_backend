import { db as prisma } from '../client';
import { Prisma } from '@prisma/client';

export async function getAllDepartments(includeDeleted = false) {
  return prisma.department.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
  });
}

export async function getDepartmentById(id: string) {
  return prisma.department.findUnique({
    where: { id, deletedAt: null },
    include: {
      designations: {
        where: { deletedAt: null },
      },
    },
  });
}

export async function getPaginatedDepartments(params: {
  where?: Prisma.DepartmentWhereInput;
  orderBy?: Prisma.DepartmentOrderByWithRelationInput;
  skip?: number;
  take?: number;
}) {
  const { where, orderBy, skip, take } = params;

  const [departments, totalCount] = await Promise.all([
    prisma.department.findMany({
      where: { ...where, deletedAt: null },
      orderBy: orderBy || { name: 'asc' },
      skip,
      take,
    }),
    prisma.department.count({
      where: { ...where, deletedAt: null },
    }),
  ]);

  return { departments, totalCount };
}

export async function createDepartment(data: Prisma.DepartmentCreateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const department = await tx.department.create({ data });

    await tx.changelog.create({
      data: {
        action: 'CREATE',
        entityType: 'Department',
        entityId: department.id,
        adminId,
        details: { 
          name: department.name,
          note: department.note 
        },
      },
    });

    return department;
  });
}

export async function updateDepartment(id: string, data: Prisma.DepartmentUpdateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const department = await tx.department.update({
      where: { id, deletedAt: null },
      data,
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'Department',
        entityId: department.id,
        adminId,
        details: { 
          name: department.name,
          note: department.note
        },
      },
    });

    return department;
  });
}

export async function deleteDepartment(id: string, adminId: string) {
  return prisma.$transaction(async tx => {
    const department = await tx.department.findUnique({
      where: { id, deletedAt: null },
      select: { name: true },
    });

    if (!department) return;

    await tx.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await tx.changelog.create({
      data: {
        action: 'DELETE',
        entityType: 'Department',
        entityId: id,
        adminId,
        details: { name: department.name },
      },
    });
  });
}

export async function checkDepartmentRelations(id: string) {
  const [designation, employee] = await Promise.all([
    prisma.designation.findFirst({ where: { departmentId: id, deletedAt: null } }),
    prisma.employee.findFirst({ where: { departmentId: id, deletedAt: null } }),
  ]);

  return {
    hasDesignations: !!designation,
    hasEmployees: !!employee,
  };
}