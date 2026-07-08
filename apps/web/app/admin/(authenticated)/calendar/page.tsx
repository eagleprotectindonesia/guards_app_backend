import { prisma } from '@repo/database';
import { requirePermission } from '@/lib/admin-auth';
import { CalendarView } from './CalendarView';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  await requirePermission('user-calendar:view');

  const [employees, admins] = await Promise.all([
    prisma.employee.findMany({
      where: { deletedAt: null },
      select: { id: true, fullName: true, employeeNumber: true },
      orderBy: { fullName: 'asc' },
    }).then(emps => emps.map(e => ({ ...e, employeeNumber: e.employeeNumber ?? '' }))),
    prisma.admin.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">User Calendar</h1>
      </div>
      <div className="flex-1 p-6">
        <CalendarView employees={employees} admins={admins} />
      </div>
    </div>
  );
}
