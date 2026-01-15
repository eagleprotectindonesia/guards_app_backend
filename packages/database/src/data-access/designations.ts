import { db as prisma } from '../client';
import { Prisma } from '@prisma/client';

export async function getAllDesignations(includeDeleted = false) {
  return prisma.designation.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: 'asc' },
    include: {
      department: true,
    },
  });
}

export async function getDesignationById(id: string) {
  return prisma.designation.findUnique({
    where: { id, deletedAt: null },
    include: {
      department: true,
    },
  });
}

export async function getDesignationsByDepartment(departmentId: string, includeDeleted = false) {
  return prisma.designation.findMany({
    where: { 
      departmentId,
      ...(includeDeleted ? {} : { deletedAt: null })
    },
    orderBy: { name: 'asc' },
  });
}

export async function createDesignation(data: Prisma.DesignationCreateUncheckedCreateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const designation = await tx.designation.create({ data });

    await tx.changelog.create({
      data: {
        action: 'CREATE',
        entityType: 'Designation',
        entityId: designation.id,
        adminId,
        details: { 
          name: designation.name,
          departmentId: designation.departmentId,
          note: designation.note
        },
      },
    });

    return designation;
  });
}

export async function updateDesignation(id: string, data: Prisma.DesignationUpdateUncheckedUpdateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    const designation = await tx.designation.update({
      where: { id, deletedAt: null },
      data,
    });

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'Designation',
        entityId: designation.id,
        adminId,
        details: { 
          name: designation.name,
          departmentId: designation.departmentId,
          note: designation.note
        },
      },
    });

    return designation;
  });
}

export async function deleteDesignation(id: string, adminId: string) {
  return prisma.$transaction(async tx => {
    const designation = await tx.designation.findUnique({
      where: { id, deletedAt: null },
      select: { name: true },
    });

    if (!designation) return;

    await tx.designation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await tx.changelog.create({
      data: {
        action: 'DELETE',
        entityType: 'Designation',
        entityId: id,
        adminId,
        details: { name: designation.name },
      },
    });
  });
}

export async function checkDesignationRelations(id: string) {
  const employee = await prisma.employee.findFirst({ where: { designationId: id, deletedAt: null } });

  return {
    hasEmployees: !!employee,
  };
}