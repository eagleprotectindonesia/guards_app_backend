import type { Metadata } from 'next';
import { endOfMonth, parse, startOfMonth } from 'date-fns';
import { getDistinctDepartments, listHolidayCalendarEntriesForDateRange } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import HolidayCalendarClient from './components/holiday-calendar-client';

export const metadata: Metadata = {
  title: 'Holiday Calendar',
};

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type HolidayCalendarEntryRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  title: string;
  type: 'holiday' | 'week_off' | 'emergency' | 'special_working_day';
  scope: 'all' | 'department';
  departmentKeys: string[];
  isPaid: boolean;
  affectsAttendance: boolean;
  notificationRequired: boolean;
  note: string | null;
};

export default async function HolidayCalendarsPage({ searchParams }: Props) {
  await requirePermission(PERMISSIONS.HOLIDAY_CALENDARS.VIEW);

  const params = await searchParams;
  const monthParam = typeof params.month === 'string' ? params.month : undefined;
  const monthDate = monthParam ? parse(`${monthParam}-01`, 'yyyy-MM-dd', new Date()) : new Date();
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  const [entries, departments] = await Promise.all([
    listHolidayCalendarEntriesForDateRange(monthStart, monthEnd),
    getDistinctDepartments(),
  ]);

  const serializedEntries = (entries as HolidayCalendarEntryRow[]).map(entry => ({
    id: entry.id,
    startDate: entry.startDate.toISOString().slice(0, 10),
    endDate: entry.endDate.toISOString().slice(0, 10),
    title: entry.title,
    type: entry.type,
    scope: entry.scope,
    departmentKeys: entry.departmentKeys,
    isPaid: entry.isPaid,
    affectsAttendance: entry.affectsAttendance,
    notificationRequired: entry.notificationRequired,
    note: entry.note,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <HolidayCalendarClient
        initialMonth={monthStart.toISOString().slice(0, 7)}
        entries={serializedEntries}
        departmentOptions={departments}
      />
    </div>
  );
}
