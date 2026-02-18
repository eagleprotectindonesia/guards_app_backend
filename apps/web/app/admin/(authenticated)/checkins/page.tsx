import { serialize, getPaginationParams } from '@/lib/utils';
import CheckinList from './components/checkin-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getAllEmployees } from '@/lib/data-access/employees';
import { getPaginatedCheckins } from '@/lib/data-access/checkins';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

type CheckinsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CheckinsPage(props: CheckinsPageProps) {
  await requirePermission(PERMISSIONS.CHECKINS.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  // Extract filters from searchParams
  const employeeId = typeof searchParams.employeeId === 'string' ? searchParams.employeeId : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;

  // Build where clause
  const where: Prisma.CheckinWhereInput = {};

  if (employeeId) {
    where.employeeId = employeeId;
  }

  if (from || to) {
    where.at = {};
    if (from) {
      where.at.gte = startOfDay(new Date(from));
    }
    if (to) {
      where.at.lte = endOfDay(new Date(to));
    }
  }

  const [{ checkins, totalCount }, employees] = await Promise.all([
    getPaginatedCheckins({
      where,
      orderBy: { at: 'desc' },
      skip,
      take: perPage,
    }),
    getAllEmployees({ fullName: 'asc' }),
  ]);

  const serializedCheckins = serialize(checkins);
  const serializedEmployees = serialize(employees);

  const initialFilters = {
    employeeId,
    startDate: from,
    endDate: to,
  };

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading check-ins...</div>}>
        <CheckinList
          checkins={serializedCheckins}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          employees={serializedEmployees}
          initialFilters={initialFilters}
        />
      </Suspense>
    </div>
  );
}
