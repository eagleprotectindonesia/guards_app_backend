'use client';

import { useState, useTransition } from 'react';
import { EmployeeWithRelations } from '@repo/database';
import { Serialized } from '@/lib/utils';
import ChangePasswordModal from './change-password-modal';
import PaginationNav from '../../components/pagination-nav';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Key, Download, History, MessageSquare, RefreshCw } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import SortableHeader from '@/components/sortable-header';
import Search from '../../components/search';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { syncEmployeesAction } from '../actions';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';

type EmployeeListProps = {
  employees: Serialized<EmployeeWithRelations>[];
  page: number;
  perPage: number;
  totalCount: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  lastSyncTimestamp?: string | null;
};

export default function EmployeeList({
  employees,
  page,
  perPage,
  totalCount,
  sortBy = 'fullName',
  sortOrder = 'asc',
  lastSyncTimestamp,
}: EmployeeListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = useSession();
  const [passwordModalData, setPasswordModalData] = useState<{ id: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const canEdit = hasPermission(PERMISSIONS.EMPLOYEES.EDIT);
  const canViewAudit = hasPermission(PERMISSIONS.CHANGELOGS.VIEW);

  const handleSort = (field: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortBy === field) {
      params.set('sortOrder', sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      params.set('sortBy', field);
      params.set('sortOrder', 'asc');
    }
    params.set('page', '1');
    router.push(`/admin/employees?${params.toString()}`);
  };

  const handleSync = async () => {
    startTransition(async () => {
      try {
        const result = await syncEmployeesAction();
        if (result.success) {
          toast.success(result.message || 'Sync queued. The employee list will update shortly.');
          router.refresh();
        } else {
          toast.error(result.message || 'Failed to sync employees.');
        }
      } catch {
        toast.error('Sync failed.');
      }
    });
  };

  const handleExportCSV = async () => {
    // Basic CSV export of current list
    try {
      const headers = [
        'Employee No',
        'Full Name',
        'Personnel ID',
        'Nickname',
        'Job Title',
        'Department',
        'Office',
        'Phone',
        'Status',
      ];
      const csvContent = [
        headers.join(','),
        ...employees.map(e =>
          [
            `"${e.employeeNumber || ''}"`,
            `"${e.fullName}"`,
            `"${e.personnelId || ''}"`,
            `"${e.nickname || ''}"`,
            `"${e.jobTitle || ''}"`,
            `"${e.department || ''}"`,
            `"${e.office?.name || ''}"`,
            e.status ? 'Active' : 'Inactive',
          ].join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `employees_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      toast.error('Failed to export CSV.');
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-x-2 mt-1">
            <p className="text-sm text-muted-foreground">Managed via external sync.</p>
            {lastSyncTimestamp && (
              <p className="text-xs text-muted-foreground italic">
                Last synced at: {format(new Date(lastSyncTimestamp), 'PPP p', { locale: enUS })}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-auto">
          <div className="w-full md:w-64">
            <Search placeholder="Search employees..." />
          </div>

          <button
            onClick={handleSync}
            disabled={isPending}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50 w-full md:w-auto"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Sync Now
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </button>

          {canViewAudit && (
            <Link
              href="/admin/employees/audit"
              className="inline-flex items-center justify-center h-10 px-4 py-2 bg-card text-foreground text-sm font-semibold rounded-lg border border-border hover:bg-muted/50 transition-colors shadow-sm w-full md:w-auto"
            >
              <History className="mr-2 h-4 w-4" />
              Audit Log
            </Link>
          )}
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <SortableHeader
                  label="Employee No"
                  field="employeeNumber"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Full Name"
                  field="fullName"
                  currentSortBy={sortBy}
                  currentSortOrder={sortOrder}
                  onSort={handleSort}
                />
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Personnel ID
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-left">
                  Department / Job Title
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">Office</th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">
                  Status
                </th>
                <th className="py-3 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No employees found. Trigger sync to fetch data.
                  </td>
                </tr>
              ) : (
                employees.map(employee => (
                  <tr key={employee.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-4 px-6 text-sm text-foreground font-medium">{employee.employeeNumber || '-'}</td>
                    <td className="py-4 px-6 text-sm text-foreground">
                      <div className="font-semibold">{employee.fullName}</div>
                      {employee.nickname && <div className="text-xs text-muted-foreground">({employee.nickname})</div>}
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground font-mono">{employee.personnelId || '-'}</td>
                    <td className="py-4 px-6 text-sm">
                      <div className="font-semibold text-foreground">{employee.department || '-'}</div>
                      <div className="text-xs text-muted-foreground">{employee.jobTitle || '-'}</div>
                    </td>
                    <td className="py-4 px-6 text-sm text-muted-foreground">{employee.office?.name || '-'}</td>
                    <td className="py-4 px-6 text-sm text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          employee.status
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                        }`}
                      >
                        {employee.status ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPasswordModalData({ id: employee.id, name: employee.fullName })}
                          disabled={!canEdit}
                          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer disabled:opacity-30"
                          title="Change Password"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('open-admin-chat', { detail: { employeeId: employee.id } })
                            )
                          }
                          className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-900/10 rounded-lg transition-colors cursor-pointer"
                          title="Chat"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationNav page={page} perPage={perPage} totalCount={totalCount} />

      {passwordModalData && (
        <ChangePasswordModal
          isOpen={true}
          onClose={() => setPasswordModalData(null)}
          employeeId={passwordModalData.id}
          employeeName={passwordModalData.name}
        />
      )}
    </div>
  );
}
