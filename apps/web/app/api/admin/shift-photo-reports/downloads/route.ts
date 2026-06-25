import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession, adminHasPermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { listShiftPhotoReportDownloadsPaginated } from '@repo/database';

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
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));
  const sortBy = searchParams.get('sortBy') ?? undefined;
  const sortOrder = searchParams.get('sortOrder') ?? undefined;

  const { downloads, totalCount } = await listShiftPhotoReportDownloadsPaginated({
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo) : undefined,
    adminId,
    reportId,
    shiftId,
    mode,
    page,
    pageSize,
    sortBy,
    sortOrder,
  });

  const serialized = downloads.map(d => ({
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
    clientName: d.report.shift.site?.clientName ?? null,
    reportNumberDisplay: d.reportNumber ?? d.report.reportNumber,
  }));

  return NextResponse.json({ downloads: serialized, totalCount });
}
