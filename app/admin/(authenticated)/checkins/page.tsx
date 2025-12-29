import { prisma } from '@/lib/prisma';
import { serialize, getPaginationParams } from '@/lib/utils';
import CheckinList from './components/checkin-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';
import { getAllGuards } from '@/lib/data-access/guards';

export const dynamic = 'force-dynamic';

type CheckinsPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CheckinsPage(props: CheckinsPageProps) {
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  // Extract filters from searchParams
  const guardId = typeof searchParams.guardId === 'string' ? searchParams.guardId : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;

  // Build where clause
  const where: Prisma.CheckinWhereInput = {};

  if (guardId) {
    where.guardId = guardId;
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

  const [checkins, totalCount, guards] = await Promise.all([
    prisma.checkin.findMany({
      where,
      orderBy: { at: 'desc' },
      skip,
      take: perPage,
      include: {
        guard: true,
        shift: {
          include: {
            site: true,
          },
        },
      },
    }),
    prisma.checkin.count({ where }),
    getAllGuards({ name: 'asc' }),
  ]);

  const serializedCheckins = serialize(checkins);
  const serializedGuards = serialize(guards);

  const initialFilters = {
    guardId,
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
          guards={serializedGuards}
          initialFilters={initialFilters}
        />
      </Suspense>
    </div>
  );
}