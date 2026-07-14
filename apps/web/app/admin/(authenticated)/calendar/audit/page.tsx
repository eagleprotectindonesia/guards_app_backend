import { prisma } from '@repo/database';
import { getPaginationParams } from '@/lib/server-utils';
import ChangelogList from '../../changelogs/components/changelog-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import type { Metadata } from 'next';
import { parseISO, isValid, startOfDay, endOfDay } from 'date-fns';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedChangelogWithAdminDto } from '@/types/changelogs';
import { AdminListSkeleton } from '../../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Calendar Audit Logs',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function CalendarAuditPage(props: PageProps) {
  await requirePermission(PERMISSIONS.CHANGELOGS.VIEW);

  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const action = searchParams.action as string | undefined;
  const startDateParam = searchParams.startDate as string | undefined;
  const endDateParam = searchParams.endDate as string | undefined;

  const sortBy = typeof searchParams.sortBy === 'string' ? searchParams.sortBy : 'createdAt';
  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : 'desc';

  const validSortFields = ['createdAt', 'action', 'entityId'];
  const sortField = validSortFields.includes(sortBy) ? (sortBy as 'createdAt' | 'action' | 'entityId') : 'createdAt';

  const where: Prisma.ChangelogWhereInput = {
    entityType: 'CalendarEvent',
  };

  if (action) {
    where.action = action;
  }

  if (startDateParam || endDateParam) {
    where.createdAt = {};
    if (startDateParam) {
      const startDate = parseISO(startDateParam);
      if (isValid(startDate)) {
        where.createdAt.gte = startOfDay(startDate);
      }
    }
    if (endDateParam) {
      const endDate = parseISO(endDateParam);
      if (isValid(endDate)) {
        where.createdAt.lte = endOfDay(endDate);
      }
    }
  }

  const [changelogs, totalCount] = await prisma.$transaction([
    prisma.changelog.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip,
      take: perPage,
      include: {
        admin: {
          select: {
            name: true,
          },
        },
        employee: {
          select: {
            fullName: true,
          },
        },
      },
    }),
    prisma.changelog.count({ where }),
  ]);

  const serializedChangelogs: SerializedChangelogWithAdminDto[] = changelogs.map(log => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    details: log.details,
    actor: log.actor,
    actorId: log.actorId,
    employeeId: log.employeeId,
    createdAt: log.createdAt.toISOString(),
    admin: log.admin ? { name: log.admin.name } : null,
    employee: log.employee ? { fullName: log.employee.fullName } : null,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <ChangelogList
          changelogs={serializedChangelogs}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          sortBy={sortField}
          sortOrder={sortOrder}
          hideEntityType={true}
          fixedEntityType="Calendar Event"
          showEntityName={true}
          exportEntityType="CalendarEvent"
        />
      </Suspense>
    </div>
  );
}
