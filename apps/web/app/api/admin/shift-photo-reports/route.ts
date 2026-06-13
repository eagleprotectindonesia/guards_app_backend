import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuthSession } from '@/lib/admin-auth';
import { listReports } from '@/lib/data-access/shift-photo-reports';
import { ShiftPhotoReportStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  const session = await getAdminAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;

  const statusParam = searchParams.get('status');
  const status = statusParam && Object.values(ShiftPhotoReportStatus).includes(statusParam as ShiftPhotoReportStatus)
    ? (statusParam as ShiftPhotoReportStatus)
    : undefined;

  try {
    const result = await listReports({
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      employeeId: searchParams.get('employeeId') ?? undefined,
      clientId: searchParams.get('clientId') ?? undefined,
      status,
      page: Number(searchParams.get('page')) || 1,
      pageSize: Number(searchParams.get('pageSize')) || 20,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error listing shift photo reports:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
