import { NextRequest, NextResponse } from 'next/server';
import { getApprovedOnsiteLeaveDateKeysInRange, getEmployeeOnsiteDayOffsForDateRange } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { endOfDay, parseISO, startOfDay } from 'date-fns';

export async function GET(request: NextRequest) {
  await requirePermission(PERMISSIONS.SHIFTS.VIEW);

  try {
    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const employeeId = searchParams.get('employeeId') || undefined;
    const formatParam = searchParams.get('format') || 'list';

    if (!startDateParam) {
      return NextResponse.json({ error: 'startDate is required' }, { status: 400 });
    }

    const startDate = startOfDay(parseISO(startDateParam));
    const endDate = endDateParam ? endOfDay(parseISO(endDateParam)) : undefined;

    const dayOffs = await getEmployeeOnsiteDayOffsForDateRange(startDate, endDate, employeeId);
    const effectiveEndDate = endDate ?? endOfDay(startDate);
    const leaveDateKeys = await getApprovedOnsiteLeaveDateKeysInRange(
      Array.from(new Set(dayOffs.map(dayOff => dayOff.employeeId))),
      startDate,
      effectiveEndDate
    );

    if (formatParam === 'map') {
      const dayOffMap = new Map<string, boolean>();
      dayOffs.forEach(dayOff => {
        const dateKey = dayOff.date.toISOString().split('T')[0];
        dayOffMap.set(`${dayOff.employeeId}:${dateKey}`, true);
      });

      return NextResponse.json({ dayOffMap: Object.fromEntries(dayOffMap) });
    }

    return NextResponse.json({
      dayOffs: dayOffs.map(dayOff => {
        const dateKey = dayOff.date.toISOString().split('T')[0];
        return {
          id: dayOff.id,
          employeeId: dayOff.employeeId,
          employeeName: dayOff.employee.fullName,
          employeeCode: dayOff.employee.employeeNumber,
          date: dayOff.date.toISOString(),
          note: leaveDateKeys.has(`${dayOff.employeeId}:${dateKey}`) ? 'On Leave' : dayOff.note,
        };
      }),
    });
  } catch (error) {
    console.error('Failed to fetch onsite employee day offs:', error);
    return NextResponse.json({ error: 'Failed to fetch onsite employee days off' }, { status: 500 });
  }
}
