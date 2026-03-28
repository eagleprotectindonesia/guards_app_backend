import { getAllOfficeWorkSchedules } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ScheduleList from './components/schedule-list';

export const dynamic = 'force-dynamic';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default async function OfficeWorkSchedulesPage() {
  await requirePermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.VIEW);

  const schedules = await getAllOfficeWorkSchedules();

  const serializedSchedules = schedules.map(schedule => ({
    id: schedule.id,
    name: schedule.name,
    code: schedule.code,
    assignmentCount: schedule._count.assignments,
    workingDaysSummary: schedule.days
      .filter(day => day.isWorkingDay)
      .map(day => WEEKDAY_SHORT[day.weekday])
      .join(', ') || 'No working days',
  }));

  return (
    <div className="max-w-7xl mx-auto">
      <ScheduleList schedules={serializedSchedules} />
    </div>
  );
}
