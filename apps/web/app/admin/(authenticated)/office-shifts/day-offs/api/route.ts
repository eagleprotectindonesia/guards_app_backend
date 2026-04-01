import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeDayOffsForDateRange } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { parseISO, startOfDay, endOfDay } from 'date-fns';

export async function GET(request: NextRequest) {
  await requirePermission(PERMISSIONS.OFFICE_SHIFTS.VIEW);

  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const employeeId = searchParams.get('employeeId') || undefined;
    const format_param = searchParams.get('format') || 'list';

    if (!startDateParam) {
      return NextResponse.json({ error: 'startDate is required' }, { status: 400 });
    }

    const startDate = startOfDay(parseISO(startDateParam));
    const endDate = endDateParam ? endOfDay(parseISO(endDateParam)) : endOfDay(new Date());

    const dayOffs = await getEmployeeDayOffsForDateRange(startDate, endDate, employeeId);

    // Support 'map' format for quick lookup by employeeId:date
    if (format_param === 'map') {
      const dayOffMap = new Map<string, boolean>();
      dayOffs.forEach((dayOff) => {
        const dateKey = dayOff.date.toISOString().split('T')[0];
        const key = `${dayOff.employeeId}:${dateKey}`;
        dayOffMap.set(key, true);
      });

      return NextResponse.json({
        dayOffMap: Object.fromEntries(dayOffMap),
      });
    }

    return NextResponse.json({
      dayOffs: dayOffs.map((dayOff) => ({
        id: dayOff.id,
        employeeId: dayOff.employeeId,
        employeeName: dayOff.employee.fullName,
        employeeCode: dayOff.employee.employeeNumber,
        date: dayOff.date.toISOString(),
        note: dayOff.note,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch employee day offs:', error);
    return NextResponse.json({ error: 'Failed to fetch employee day offs' }, { status: 500 });
  }
}
