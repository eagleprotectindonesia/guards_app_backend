import { serialize, getPaginationParams } from '@/lib/utils';
import EmployeeList from './components/employee-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { parseISO, isValid } from 'date-fns';
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
  const startDateParam = searchParams.startDate as string | undefined;
  const endDateParam = searchParams.endDate as string | undefined;

  // Handle sorting parameters
  const sortBy = typeof searchParams.sortBy === 'string' ? searchParams.sortBy : 'joinDate'; // Default to joinDate

  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'desc';

  // Validate sortBy field to prevent SQL injection
  const validSortFields = ['firstName', 'lastName', 'id', 'employeeCode', 'joinDate'];
  let sortField: string = validSortFields.includes(sortBy)
    ? sortBy
    : 'joinDate';
  
  // Handle backward compatibility or simplified sorting
  if (sortBy === 'name') sortField = 'firstName';

  const where: Prisma.EmployeeWhereInput = {};

  if (query) {
    where.OR = [
      { firstName: { contains: query, mode: 'insensitive' } },
      { lastName: { contains: query, mode: 'insensitive' } },
      { phone: { contains: query, mode: 'insensitive' } },
      { id: { contains: query, mode: 'insensitive' } },
      { employeeCode: { contains: query, mode: 'insensitive' } },
    ];
  }

  // Date Range Filter logic
  if (startDateParam || endDateParam) {
    where.joinDate = {};
    if (startDateParam) {
      const startDate = parseISO(startDateParam);
      if (isValid(startDate)) {
        where.joinDate.gte = startDate;
      }
    }
    if (endDateParam) {
      const endDate = parseISO(endDateParam);
      if (isValid(endDate)) {
        where.joinDate.lte = endDate;
      }
    }
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
          startDate={startDateParam}
          endDate={endDateParam}
        />
      </Suspense>
    </div>
  );
}
