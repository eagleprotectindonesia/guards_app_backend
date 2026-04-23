import { NextResponse } from 'next/server';
import { addDays, startOfDay } from 'date-fns';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { listFutureHolidayAnnouncementsForEmployee } from '@repo/database';

export async function GET() {
  const employee = await getAuthenticatedEmployee();
  if (!employee) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const fromDate = startOfDay(now);
    const toDate = startOfDay(addDays(now, 90));
    const holidayAnnouncements = await listFutureHolidayAnnouncementsForEmployee({
      department: employee.department ?? null,
      fromDate,
      toDate,
    });

    const announcements = holidayAnnouncements.map(item => ({
      id: `holiday:${item.id}`,
      kind: 'holiday' as const,
      title: item.title,
      message: item.note,
      startsAt: item.startDate.toISOString(),
      endsAt: item.endDate.toISOString(),
      createdAt: item.createdAt.toISOString(),
      meta: {
        holidayEntryId: item.id,
        holidayType: item.type,
        isPaid: item.isPaid,
        affectsAttendance: item.affectsAttendance,
        notificationRequired: item.notificationRequired,
        scope: item.scope,
      },
    }));

    console.info('[EmployeeAnnouncementsAPI] Response complete', {
      employeeId: employee.id,
      department: employee.department ?? null,
      fromDate: fromDate.toISOString(),
      toDate: toDate.toISOString(),
      count: announcements.length,
    });

    return NextResponse.json({ announcements });
  } catch (error: unknown) {
    console.error('Error fetching employee announcements:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
