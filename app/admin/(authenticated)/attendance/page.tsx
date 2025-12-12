import { prisma } from '@/lib/prisma';
import { serialize, getPaginationParams } from '@/lib/utils';
import AttendanceList from './components/attendance-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import { startOfDay, endOfDay } from 'date-fns';

export const dynamic = 'force-dynamic';

type AttendancePageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AttendancePage(props: AttendancePageProps) {
  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);

  // Extract filters from searchParams
  const guardId = typeof searchParams.guardId === 'string' ? searchParams.guardId : undefined;
  const from = typeof searchParams.from === 'string' ? searchParams.from : undefined;
  const to = typeof searchParams.to === 'string' ? searchParams.to : undefined;

  // Build where clause for attendance records
  const where: Prisma.AttendanceWhereInput = {};

  if (guardId) {
    where.shift = {
      guardId: guardId,
    };
  }

  if (from || to) {
    where.recordedAt = {};
    if (from) {
      where.recordedAt.gte = startOfDay(new Date(from));
    }
    if (to) {
      where.recordedAt.lte = endOfDay(new Date(to));
    }
  }

  const [attendances, totalCount, guards] = await prisma.$transaction([
    prisma.attendance.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      skip,
      take: perPage,
      include: {
        shift: {
          include: {
            guard: true,
            site: true,
          },
        },
      },
    }),
    prisma.attendance.count({ where }),
    prisma.guard.findMany({
      orderBy: { name: 'asc' },
    }),
  ]);

  const serializedAttendances = serialize(attendances);
  const serializedGuards = serialize(guards);

  const initialFilters = {
    guardId,
    startDate: from,
    endDate: to,
  };

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<div>Loading attendances...</div>}>
        <AttendanceList
          attendances={serializedAttendances}
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
