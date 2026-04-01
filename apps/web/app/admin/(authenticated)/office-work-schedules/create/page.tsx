import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/admin-auth';
import { PERMISSIONS } from '@/lib/auth/permissions';
import ScheduleForm from '../components/schedule-form';
import { createOfficeWorkScheduleAction } from '../actions';
import { isOfficeWorkSchedulesEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export default async function CreateOfficeWorkSchedulePage() {
  if (!isOfficeWorkSchedulesEnabled()) {
    notFound();
  }

  await requirePermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.CREATE);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <ScheduleForm
        title="Create Office Schedule"
        description="Create a reusable schedule template that HR can assign to office employees."
        submitLabel="Create Schedule"
        action={createOfficeWorkScheduleAction}
      />
    </div>
  );
}
