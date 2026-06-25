import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession, adminHasPermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { exportShiftPhotoReportDownloadsCsv } from '@repo/database';
import { format } from 'date-fns';

export async function GET(request: NextRequest) {
  const session = await getAdminAuthSession();
  if (!session || !adminHasPermission(session, PERMISSIONS.CHANGELOGS.VIEW)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;

  const dateFrom = searchParams.get('dateFrom') ?? undefined;
  const dateTo = searchParams.get('dateTo') ?? undefined;
  const adminId = searchParams.get('adminId') ?? undefined;
  const reportId = searchParams.get('reportId') ?? undefined;
  const shiftId = searchParams.get('shiftId') ?? undefined;
  const mode = searchParams.get('mode') ?? undefined;

  const csv = await exportShiftPhotoReportDownloadsCsv({
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    adminId,
    reportId,
    shiftId,
    mode,
  });

  const filename = `download_log_${format(new Date(), 'yyyy-MM-dd')}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
