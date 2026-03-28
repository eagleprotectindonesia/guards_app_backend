'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';

type ScheduleListItem = {
  id: string;
  name: string;
  code: string;
  assignmentCount: number;
  workingDaysSummary: string;
};

type Props = {
  schedules: ScheduleListItem[];
};

export default function ScheduleList({ schedules }: Props) {
  const { hasPermission } = useSession();
  const canCreate = hasPermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.CREATE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Schedules</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage reusable office working day templates.</p>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          {canViewAudit && (
            <Link
              href="/admin/office-work-schedules/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
          {canCreate && (
            <Link
              href="/admin/office-work-schedules/create"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm w-full md:w-auto"
            >
              Create Schedule
            </Link>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Code</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Working Days
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Assignments
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No office schedules found.
                  </td>
                </tr>
              ) : (
                schedules.map(schedule => (
                  <tr key={schedule.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{schedule.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono">{schedule.code}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{schedule.workingDaysSummary}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{schedule.assignmentCount}</td>
                    <td className="py-4 px-6 text-right">
                      <Link
                        href={`/admin/office-work-schedules/${schedule.id}/edit`}
                        className="inline-flex items-center justify-center h-9 px-4 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/40"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
