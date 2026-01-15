import { db as prisma } from '../client';

export async function getAllDesignations() {
  return prisma.designation.findMany({
    orderBy: { name: 'asc' },
    include: {
      department: true,
    },
  });
}

export async function getDesignationsByDepartment(departmentId: string) {
  return prisma.designation.findMany({
    where: { departmentId },
    orderBy: { name: 'asc' },
  });
}
