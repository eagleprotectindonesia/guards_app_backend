import { db as prisma } from '../client';
import { Prisma, EmployeeRole } from '@prisma/client';
import { deleteFutureShiftsByDesignation } from './shifts';

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

export async function createDesignation(data: Prisma.DesignationUncheckedCreateInput, adminId: string) {
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
          role: designation.role,
          departmentId: designation.departmentId,
          note: designation.note
        },
      },
    });

    return designation;
  });
}

export async function updateDesignation(id: string, data: Prisma.DesignationUncheckedUpdateInput, adminId: string) {
  return prisma.$transaction(async tx => {
    // Get current designation state for role comparison
    const currentDesignation = await tx.designation.findUnique({
      where: { id, deletedAt: null },
      select: { role: true },
    });

    const designation = await tx.designation.update({
      where: { id, deletedAt: null },
      data,
    });

    // If role is updated, propagate to all employees with this designation
    if (data.role && typeof data.role === 'string') {
      await tx.employee.updateMany({
        where: { designationId: id, deletedAt: null },
        data: { role: data.role as EmployeeRole },
      });

      // If role changes from on_site to office, delete all future shifts for all affected employees
      if (currentDesignation?.role === 'on_site' && data.role === 'office') {
        await deleteFutureShiftsByDesignation(id, adminId, tx);
      }

      // If role changes from office to on_site, nullify the office assignment for all affected employees
      if (currentDesignation?.role === 'office' && data.role === 'on_site') {
        await tx.employee.updateMany({
          where: { designationId: id, deletedAt: null },
          data: { officeId: null },
        });
      }
    }

    await tx.changelog.create({
      data: {
        action: 'UPDATE',
        entityType: 'Designation',
        entityId: designation.id,
        adminId,
        details: { 
          name: designation.name,
          role: designation.role,
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