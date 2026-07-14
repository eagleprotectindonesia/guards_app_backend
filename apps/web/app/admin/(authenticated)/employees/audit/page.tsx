import { prisma, getAllEmployees } from '@repo/database';
import { getPaginationParams } from '@/lib/server-utils';
import ChangelogList from '../../changelogs/components/changelog-list';
import { Suspense } from 'react';
import { Prisma } from '@prisma/client';
import type { Metadata } from 'next';
import { parseISO, isValid, startOfDay, endOfDay } from 'date-fns';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { SerializedChangelogWithAdminDto, EntitySummary } from '@/types/changelogs';
import { AdminListSkeleton } from '../../components/loading/admin-list-skeleton';

export const metadata: Metadata = {
  title: 'Employee Audit Logs',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function EmployeeAuditPage(props: PageProps) {
  await requirePermission([PERMISSIONS.EMPLOYEES.VIEW, PERMISSIONS.CHANGELOGS.VIEW]);

  const searchParams = await props.searchParams;
  const { page, perPage, skip } = getPaginationParams(searchParams);
  const action = searchParams.action as string | undefined;
  const entityId = searchParams.entityId as string | undefined;
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
    entityType: 'Employee',
  };

  if (action) {
    where.action = action;
  }

  if (entityId) {
    where.entityId = entityId;
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

  const [changelogs, totalCount, employees] = await Promise.all([
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
      },
    }),
    prisma.changelog.count({ where }),
    getAllEmployees({ orderBy: { fullName: 'asc' } }),
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
  }));

  const serializedEmployees: EntitySummary[] = employees.map(emp => ({
    id: emp.id,
    fullName: emp.fullName,
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
          fixedEntityType="Employee"
          showEntityName={true}
          entityFilterConfig={{
            urlKey: 'entityId',
            label: 'Employee',
            allLabel: 'All employees',
            options: serializedEmployees.map(e => ({ value: e.id, label: e.fullName || e.name || '' })),
          }}
        />
      </Suspense>
    </div>
  );
}
