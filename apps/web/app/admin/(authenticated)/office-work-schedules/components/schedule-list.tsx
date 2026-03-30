'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { History } from 'lucide-react';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { EditButton, DeleteButton } from '../../components/action-buttons';
import { deleteOfficeWorkScheduleAction } from '../actions';
import toast from 'react-hot-toast';

type ScheduleListItem = {
  id: string;
  name: string;
  assignmentCount: number;
  workingDaysSummary: string;
  lastUpdatedBy?: { name: string } | null;
  createdBy?: { name: string } | null;
};

type Props = {
  schedules: ScheduleListItem[];
};

export default function ScheduleList({ schedules }: Props) {
  const [isPending, startTransition] = useTransition();
  const { hasPermission } = useSession();
  const canCreate = hasPermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.CREATE);
  const canEdit = hasPermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.EDIT);
  const canDelete = hasPermission(PERMISSIONS.OFFICE_WORK_SCHEDULES.DELETE);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const handleDelete = async (id: string, name: string, assignmentCount: number) => {
    if (!canDelete) return;

    const assignmentCopy =
      assignmentCount === 1
        ? 'This schedule currently has 1 associated employee assignment. Deletion only succeeds when all references are future assignments; those future assignments will be removed and adjacent schedule ranges will be re-linked automatically.'
        : `This schedule currently has ${assignmentCount} associated employee assignments. Deletion only succeeds when all references are future assignments; those future assignments will be removed and adjacent schedule ranges will be re-linked automatically.`;

    if (
      !window.confirm(
        `Delete office schedule "${name}"? This action cannot be undone. ${assignmentCopy}`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteOfficeWorkScheduleAction(id);
      if (result.success) {
        toast.success(result.message || 'Office schedule deleted successfully.');
      } else {
        toast.error(result.message || 'Failed to delete office schedule.');
      }
    });
  };

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
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Working Days
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Assignments
                </th>
                <th className="py-3 px-6 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-blue-600 dark:text-blue-400">Created By</span>
                    <span className="text-muted-foreground/60">Last Updated By</span>
                  </div>
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
                  <tr key={schedule.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-foreground">{schedule.name}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{schedule.workingDaysSummary}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{schedule.assignmentCount}</td>
                    <td className="py-4 px-6 text-sm text-muted-foreground text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            schedule.createdBy?.name
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30'
                              : 'text-muted-foreground/50'
                          }`}
                          title="Created By"
                        >
                          {schedule.createdBy?.name || '-'}
                        </div>
                        <div
                          className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                            schedule.lastUpdatedBy?.name
                              ? 'bg-muted text-foreground border border-border'
                              : 'text-muted-foreground/50'
                          }`}
                          title="Last Updated By"
                        >
                          {schedule.lastUpdatedBy?.name || '-'}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-100">
                        <EditButton
                          href={`/admin/office-work-schedules/${schedule.id}/edit`}
                          disabled={!canEdit}
                          title={!canEdit ? 'Permission Denied' : 'Edit'}
                        />
                        <DeleteButton
                          onClick={() => handleDelete(schedule.id, schedule.name, schedule.assignmentCount)}
                          disabled={!canDelete || isPending}
                          title={!canDelete ? 'Permission Denied' : 'Delete'}
                        />
                      </div>
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
