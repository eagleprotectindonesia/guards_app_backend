import { NextRequest, NextResponse } from 'next/server';
import { endOfDay, format, startOfDay } from 'date-fns';
import { getEmployeeDayOffsForDateRange } from '@repo/database';
import { adminHasPermission, getAdminAuthSession } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const session = await getAdminAuthSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!adminHasPermission(session, PERMISSIONS.OFFICE_SHIFTS.VIEW)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDateStr = searchParams.get('startDate');
  const endDateStr = searchParams.get('endDate');

  if (!startDateStr || !endDateStr) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  const startDate = startOfDay(new Date(startDateStr));
  const endDate = endOfDay(new Date(endDateStr));
  const dayOffs = await getEmployeeDayOffsForDateRange(startDate, endDate);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const headers = ['Date', 'Employee Name', 'Employee Code', 'Note'];
      controller.enqueue(encoder.encode(headers.join(',') + '\n'));

      let chunk = '';
      for (const dayOff of dayOffs) {
        chunk +=
          [
            escapeCsv(format(new Date(dayOff.date), 'yyyy-MM-dd')),
            escapeCsv(dayOff.employee.fullName),
            escapeCsv(dayOff.employee.employeeNumber || ''),
            escapeCsv(dayOff.note || ''),
          ].join(',') + '\n';
      }

      controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="office_day_offs_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
