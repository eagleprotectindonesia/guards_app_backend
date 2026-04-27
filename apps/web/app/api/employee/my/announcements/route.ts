import { NextResponse } from 'next/server';
import { addDays, startOfDay } from 'date-fns';
import { getAuthenticatedEmployee } from '@/lib/employee-auth';
import { listActiveOfficeMemosForEmployee, listFutureHolidayAnnouncementsForEmployee } from '@repo/database';

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
    const officeMemos = await listActiveOfficeMemosForEmployee({
      department: employee.department ?? null,
      fromDate,
      toDate,
    });

    const announcements = [
      ...holidayAnnouncements.map(item => ({
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
      })),
      ...officeMemos.map(item => ({
        id: `office_memo:${item.id}`,
        kind: 'office_memo' as const,
        title: item.title,
        message: item.message,
        startsAt: item.startDate.toISOString(),
        endsAt: item.endDate.toISOString(),
        createdAt: item.createdAt.toISOString(),
        meta: {
          officeMemoId: item.id,
          scope: item.scope,
        },
      })),
    ].sort((a, b) => {
      const byStart = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      if (byStart !== 0) return byStart;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ announcements });
  } catch (error: unknown) {
    console.error('Error fetching employee announcements:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
