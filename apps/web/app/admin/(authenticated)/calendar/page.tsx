import { prisma, getDistinctDepartments } from '@repo/database';
import Link from 'next/link';
import { History } from 'lucide-react';
import { CalendarView } from './CalendarView';
import { getAdminAuthSession } from '@/lib/admin-auth';
import { hasPermission } from '@/lib/auth/has-permission';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const [employees, admins, departments] = await Promise.all([
    prisma.employee
      .findMany({
        where: { deletedAt: null },
        select: { id: true, fullName: true, employeeNumber: true },
        orderBy: { fullName: 'asc' },
      })
      .then(emps => emps.map(e => ({ ...e, employeeNumber: e.employeeNumber ?? '' }))),
    prisma.admin.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    getDistinctDepartments(),
  ]);

  const session = await getAdminAuthSession();
  const canViewAudit = await hasPermission(
    session ? { userId: session.id, roleName: session.roleName, permissions: session.permissions } : null,
    PERMISSIONS.CHANGELOGS.VIEW
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold text-foreground">User Calendar</h1>
        {canViewAudit && (
          <Link
            href="/admin/calendar/audit"
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm"
          >
            <History className="mr-2 h-4 w-4" />
            Audit Log
          </Link>
        )}
      </div>
      <div className="flex-1 p-6">
        <CalendarView employees={employees} admins={admins} departments={departments} />
      </div>
    </div>
  );
}
