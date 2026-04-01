import { notFound } from 'next/navigation';
import { getAllOfficeWorkSchedules } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ScheduleList from './components/schedule-list';
import { isOfficeWorkSchedulesEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function OfficeWorkSchedulesPage() {
  if (!isOfficeWorkSchedulesEnabled()) {
    notFound();
  }

  await requirePermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.VIEW);

  const schedules = await getAllOfficeWorkSchedules();

  const serializedSchedules = schedules.map(schedule => ({
    id: schedule.id,
    name: schedule.name,
    assignmentCount: schedule._count.assignments,
    workingDaysSummary: schedule.days
      .filter(day => day.isWorkingDay)
      .map(day => WEEKDAY_SHORT[day.weekday])
      .join(', ') || 'No working days',
    createdBy: schedule.createdBy,
    lastUpdatedBy: schedule.lastUpdatedBy,
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <ScheduleList schedules={serializedSchedules} />
    </div>
  );
}
