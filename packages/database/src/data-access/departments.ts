import { db as prisma } from '../client';

export async function getAllDepartments() {
  return prisma.department.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function getDepartmentById(id: string) {
  return prisma.department.findUnique({
    where: { id },
    include: {
      designations: true,
    },
  });
}
