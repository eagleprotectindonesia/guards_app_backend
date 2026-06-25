import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { serialize } from '@/lib/server-utils';
import { listShiftPhotoReportDownloadsPaginated } from '@repo/database';
import DownloadsLog from '../components/downloads-log';
import { Suspense } from 'react';
import { AdminListSkeleton } from '../../components/loading/admin-list-skeleton';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ShiftPhotoReportDownloadsPage(props: PageProps) {
  await requirePermission([PERMISSIONS.SHIFT_PHOTO_REPORTS.VIEW, PERMISSIONS.CHANGELOGS.VIEW]);

  const searchParams = await props.searchParams;
  const page = Math.max(1, parseInt((searchParams.page as string) ?? '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt((searchParams.perPage as string) ?? '20', 10)));
  const dateFrom = searchParams.dateFrom as string | undefined;
  const dateTo = searchParams.dateTo as string | undefined;
  const mode = searchParams.mode as string | undefined;
  const sortBy = (searchParams.sortBy as string) ?? 'downloadedAt';
  const sortOrder = (searchParams.sortOrder as 'asc' | 'desc') ?? 'desc';

  const { downloads: rawDownloads, totalCount } = await listShiftPhotoReportDownloadsPaginated({
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    mode,
    page,
    pageSize: perPage,
    sortBy,
    sortOrder,
  });

  const downloads = rawDownloads.map(d => ({
    id: d.id,
    reportId: d.reportId,
    reportNumber: d.reportNumber ?? d.report.reportNumber,
    shiftId: d.shiftId,
    adminId: d.adminId,
    adminName: d.admin.name,
    adminEmail: d.admin.email,
    mode: d.mode,
    userAgent: d.userAgent,
    ipAddress: d.ipAddress,
    downloadedAt: d.downloadedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
    guardName: d.report.employee?.fullName ?? null,
    guardNumber: d.report.employee?.employeeNumber ?? null,
    siteName: d.report.shift.site?.name ?? null,
    reportNumberDisplay: d.reportNumber ?? d.report.reportNumber,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <DownloadsLog
          downloads={serialize(downloads)}
          totalCount={totalCount}
          dateFrom={dateFrom}
          dateTo={dateTo}
          mode={mode ?? ''}
          page={page}
          perPage={perPage}
          sortBy={sortBy}
          sortOrder={sortOrder}
        />
      </Suspense>
    </div>
  );
}
