import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { serialize, getPaginationParams } from '@/lib/server-utils';
import {
  listShiftPhotoReportsPaginated,
  getActiveEmployeesSummary,
} from '@repo/database';
import { getCachedPresignedDownloadUrl } from '@repo/storage';
import { ShiftPhotoReportStatus } from '@prisma/client';
import ShiftPhotoReportsList from './components/shift-photo-reports-list';
import { Suspense } from 'react';
import { AdminListSkeleton } from '../components/loading/admin-list-skeleton';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = Object.values(ShiftPhotoReportStatus) as string[];

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
  const statusParam = searchParams.status as string | undefined;
  const status = statusParam && VALID_STATUSES.includes(statusParam) ? (statusParam as ShiftPhotoReportStatus) : undefined;

  const { reports, totalCount } = await listShiftPhotoReportsPaginated({
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    employeeId,
    status,
    page,
    pageSize: perPage,
  });

  const employees = await getActiveEmployeesSummary('on_site');

  const enriched = await Promise.all(
    reports.map(async report => ({
      ...report,
      downloadUrl: report.pdfS3Key ? await getCachedPresignedDownloadUrl(report.pdfS3Key) : null,
    }))
  );

  return (
    <div className="max-w-7xl mx-auto">
      <Suspense fallback={<AdminListSkeleton rows={8} />}>
        <ShiftPhotoReportsList
          reports={serialize(enriched)}
          employees={serialize(employees)}
          dateFrom={dateFrom}
          dateTo={dateTo}
          employeeId={employeeId}
          statusParam={statusParam}
          page={page}
          perPage={perPage}
          totalCount={totalCount}
          validStatuses={VALID_STATUSES}
        />
      </Suspense>
    </div>
  );
}
