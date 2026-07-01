import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { serialize, getPaginationParams } from '@/lib/server-utils';
import {
  listShiftPhotoReportsPaginated,
  getActiveEmployeesSummary,
  getActiveSites,
  getShiftPhotoReportDownloadCountsByReportIds,
} from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@repo/storage';
import ShiftPhotoReportsList from './components/shift-photo-reports-list';
import { Suspense } from 'react';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ShiftPhotoReportsPage(props: PageProps) {
  await requirePermission(PERMISSIONS.SHIFT_PHOTO_REPORTS.VIEW);
  const searchParams = await props.searchParams;
  const { page, perPage } = getPaginationParams(searchParams, 20);

  const dateFrom = searchParams.dateFrom as string | undefined;
  const dateTo = searchParams.dateTo as string | undefined;
  const employeeId = searchParams.employeeId as string | undefined;
  const siteId = searchParams.siteId as string | undefined;
  const status = searchParams.status as string | undefined;
  const sortBy = typeof searchParams.sortBy === 'string' ? searchParams.sortBy : undefined;
  const sortOrder =
    typeof searchParams.sortOrder === 'string' && ['asc', 'desc'].includes(searchParams.sortOrder)
      ? (searchParams.sortOrder as 'asc' | 'desc')
      : undefined;

  const { reports, totalCount } = await listShiftPhotoReportsPaginated({
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    employeeId,
    siteId,
    status,
    page,
    pageSize: perPage,
    sortBy,
    sortOrder,
  });

  const employees = await getActiveEmployeesSummary('on_site');
  const sites = (await getActiveSites()).map(s => ({ id: s.id, name: s.name }));

  const reportIds = reports.map(r => r.id);
  const downloadCounts = reportIds.length > 0
    ? await getShiftPhotoReportDownloadCountsByReportIds(reportIds)
    : {} as Record<string, number>;

  const enriched = await Promise.all(
    reports.map(async report => ({
      ...report,
      downloadUrl: report.pdfS3Key ? await getCachedPresignedDownloadUrl(report.pdfS3Key) : null,
      downloadCount: downloadCounts[report.id] ?? 0,
    }))
  );

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <ShiftPhotoReportsList
          reports={serialize(enriched)}
          employees={serialize(employees)}
          sites={sites}
          dateFrom={dateFrom}
          dateTo={dateTo}
          employeeId={employeeId}
          siteId={siteId}
          status={status}
          sortBy={sortBy ?? 'createdAt'}
          sortOrder={sortOrder ?? 'desc'}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
        />
      </Suspense>
    </div>
  );
}
