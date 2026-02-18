import { serialize, getPaginationParams } from '@/lib/utils';
import EmployeeList from './components/employee-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import type { Metadata } from 'next';
import { getPaginatedEmployees } from '@/lib/data-access/employees';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const metadata: Metadata = {
  title: 'Employees Management',
};

export const dynamic = 'force-dynamic';

type EmployeesPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function EmployeesPage(props: EmployeesPageProps) {
  await requirePermission(PERMISSIONS.EMPLOYEES.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const query = searchParams.q as string | undefined;

  // Handle sorting parameters
  const sortBy = typeof searchParams.sortBy === 'string' ? searchParams.sortBy : 'fullName';

  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'asc';

  // Validate sortBy field to prevent SQL injection
  const validSortFields = ['fullName', 'employeeNumber', 'id', 'department', 'jobTitle'];
  const sortField: string = validSortFields.includes(sortBy) ? sortBy : 'fullName';

  const where: Prisma.EmployeeWhereInput = {};

  if (query) {
    where.OR = [
      { fullName: { contains: query, mode: 'insensitive' } },
      { id: { contains: query, mode: 'insensitive' } },
      { employeeNumber: { contains: query, mode: 'insensitive' } },
      { personnelId: { contains: query, mode: 'insensitive' } },
      { nickname: { contains: query, mode: 'insensitive' } },
      { jobTitle: { contains: query, mode: 'insensitive' } },
      { department: { contains: query, mode: 'insensitive' } },
    ];
  }

  const { employees, totalCount } = await getPaginatedEmployees({
    where,
    orderBy: { [sortField]: sortOrder as 'asc' | 'desc' },
    skip,
    take: perPage,
  });

  const serializedEmployees = serialize(employees);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading employees...</div>}>
        <EmployeeList
          employees={serializedEmployees}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          sortBy={sortField}
          sortOrder={sortOrder}
        />
      </Suspense>
    </div>
  );
}
