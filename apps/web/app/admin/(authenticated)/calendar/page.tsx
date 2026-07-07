import { requirePermission } from '@/lib/admin-auth';
import { CalendarView } from './CalendarView';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  await requirePermission('user-calendar:view');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">User Calendar</h1>
      </div>
      <div className="flex-1 p-6">
        <CalendarView />
      </div>
    </div>
  );
}
