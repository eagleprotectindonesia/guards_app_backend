import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getOfficeWorkScheduleById } from '@repo/database';
import ScheduleForm from '../../components/schedule-form';
import { updateOfficeWorkScheduleAction } from '../../actions';
import { isOfficeWorkSchedulesEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export default async function EditOfficeWorkSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  if (!isOfficeWorkSchedulesEnabled()) {
    notFound();
  }

  await requirePermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.EDIT);
  const { id } = await params;

  const schedule = await getOfficeWorkScheduleById(id);
  if (!schedule) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ScheduleForm
        title="Edit Office Schedule"
        description="Update the weekday rules for this reusable office schedule template."
        submitLabel="Save Schedule"
        action={updateOfficeWorkScheduleAction.bind(null, id)}
        schedule={{
          id: schedule.id,
          name: schedule.name,
          days: schedule.days.map(day => ({
            weekday: day.weekday,
            isWorkingDay: day.isWorkingDay,
            startTime: day.startTime,
            endTime: day.endTime,
          })),
        }}
      />
    </div>
  );
}
