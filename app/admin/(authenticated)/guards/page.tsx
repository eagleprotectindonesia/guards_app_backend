import { prisma } from '@/lib/prisma';
import { serialize, getPaginationParams } from '@/lib/utils';
import GuardList from './components/guard-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { parseISO, isValid, startOfDay, endOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';

type GuardsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function GuardsPage(props: GuardsPageProps) {
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const query = searchParams.q as string | undefined;
  const startDateParam = searchParams.startDate as string | undefined;
  const endDateParam = searchParams.endDate as string | undefined;

  // Handle sorting parameters
  const sortBy = typeof searchParams.sortBy === 'string' ? searchParams.sortBy : 'joinDate'; // Default to joinDate

  const sortOrder =
    (typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? searchParams.sortOrder as 'asc' | 'desc'
      : 'desc');

  // Validate sortBy field to prevent SQL injection
  const validSortFields = ['name', 'guardCode', 'joinDate'];
  const sortField = validSortFields.includes(sortBy) ? (sortBy as 'name' | 'guardCode' | 'joinDate') : 'joinDate';

  const where: Prisma.GuardWhereInput = {};

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { phone: { contains: query, mode: 'insensitive' } },
      { guardCode: { contains: query, mode: 'insensitive' } },
    ];
  }

  // Date Range Filter logic
  if (startDateParam || endDateParam) {
    where.joinDate = {};
    if (startDateParam) {
      const startDate = parseISO(startDateParam);
      if (isValid(startDate)) {
        where.joinDate.gte = startOfDay(startDate);
      }
    }
    if (endDateParam) {
      const endDate = parseISO(endDateParam);
      if (isValid(endDate)) {
        where.joinDate.lte = endOfDay(endDate);
      }
    }
  }

  const [guards, totalCount] = await prisma.$transaction([
    prisma.guard.findMany({
      where,
      orderBy: { [sortField]: sortOrder as 'asc' | 'desc' },
      skip,
      take: perPage,
    }),
    prisma.guard.count({ where }),
  ]);

  const serializedGuards = serialize(guards);

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading guards...</div>}>
        <GuardList
          guards={serializedGuards}
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
