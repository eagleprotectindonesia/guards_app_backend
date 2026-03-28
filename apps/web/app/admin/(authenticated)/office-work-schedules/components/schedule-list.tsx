'use client';

import Link from 'next/link';

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
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Office Schedules</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage reusable office working day templates.</p>
        </div>
        <Link
          href="/admin/office-work-schedules/create"
          className="inline-flex items-center justify-center h-10 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          Create Schedule
        </Link>
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
