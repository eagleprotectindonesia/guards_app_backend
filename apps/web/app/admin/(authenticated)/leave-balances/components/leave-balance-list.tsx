'use client';

import { useMemo, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { adjustAnnualLeaveBalanceAction } from '../actions';

type EmployeeOption = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
};

type LeaveBalanceRow = {
  employee: {
    id: string;
    fullName: string;
    employeeNumber: string | null;
  };
  year: number;
  entitledDays: number;
  adjustedDays: number;
  consumedDays: number;
  availableDays: number;
};

type Props = {
  rows: LeaveBalanceRow[];
  page: number;
  perPage: number;
  totalCount: number;
  year: number;
  employeeId?: string;
  employees: EmployeeOption[];
};

export default function LeaveBalanceList({ rows, page, perPage, totalCount, year, employeeId, employees }: Props) {
  const router = useRouter();
  const { hasPermission } = useSession();
  const canEdit = hasPermission(PERMISSIONS.LEAVE_REQUESTS.EDIT);
  const [isPending, startTransition] = useTransition();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(rows[0]?.employee.id ?? '');
  const [adjustDays, setAdjustDays] = useState<string>('1');
  const [note, setNote] = useState('');
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  const selectedEmployee = useMemo(() => employees.find(employee => employee.id === selectedEmployeeId), [employees, selectedEmployeeId]);

  const applyFilter = (next: { year?: number; employeeId?: string }) => {
    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('perPage', String(perPage));
    params.set('year', String(next.year ?? year));
    if (next.employeeId) {
      params.set('employeeId', next.employeeId);
    }
    router.push(`/admin/leave-balances?${params.toString()}`);
  };

  const goToPage = (nextPage: number) => {
    const clamped = Math.min(totalPages, Math.max(1, nextPage));
    const params = new URLSearchParams();
    params.set('page', String(clamped));
    params.set('perPage', String(perPage));
    params.set('year', String(year));
    if (employeeId) {
      params.set('employeeId', employeeId);
    }
    router.push(`/admin/leave-balances?${params.toString()}`);
  };

  const submitAdjustment = () => {
    const days = Number(adjustDays);
    if (!selectedEmployeeId) {
      toast.error('Select an employee first.');
      return;
    }
    if (!Number.isInteger(days) || days === 0) {
      toast.error('Adjustment days must be a non-zero integer.');
      return;
    }
    if (!note.trim()) {
      toast.error('Adjustment note is required.');
      return;
    }

    startTransition(async () => {
      const result = await adjustAnnualLeaveBalanceAction({
        employeeId: selectedEmployeeId,
        year,
        days,
        note: note.trim(),
      });
      if (!result.success) {
        toast.error(result.message || 'Failed to adjust annual leave balance.');
        return;
      }
      toast.success(result.message || 'Annual leave balance adjusted.');
      setAdjustDays('1');
      setNote('');
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl shadow-sm border border-border p-6">
        <h1 className="text-2xl font-bold text-foreground">Annual Leave Balances</h1>
        <p className="text-sm text-muted-foreground mt-1">View yearly leave balances and apply manual adjustments with audit notes.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <div>
            <label htmlFor="balanceYear" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Year
            </label>
            <input
              id="balanceYear"
              type="number"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              value={year}
              onChange={event => applyFilter({ year: Number(event.target.value), employeeId })}
            />
          </div>
          <div>
            <label htmlFor="filterEmployee" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Employee
            </label>
            <select
              id="filterEmployee"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              value={employeeId ?? ''}
              onChange={event => applyFilter({ employeeId: event.target.value || undefined })}
            >
              <option value="">All employees</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName} {employee.employeeNumber ? `(${employee.employeeNumber})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Rows</p>
            <p className="text-lg font-semibold text-foreground mt-1">{totalCount}</p>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Adjust Balance</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label htmlFor="adjustEmployee" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Employee
              </label>
              <select
                id="adjustEmployee"
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                value={selectedEmployeeId}
                onChange={event => setSelectedEmployeeId(event.target.value)}
                disabled={isPending}
              >
                <option value="">Select employee</option>
                {employees.map(employee => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} {employee.employeeNumber ? `(${employee.employeeNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="adjustDays" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Days (+/-)
              </label>
              <input
                id="adjustDays"
                type="number"
                className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
                value={adjustDays}
                onChange={event => setAdjustDays(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={submitAdjustment}
                disabled={isPending || !selectedEmployeeId}
                className="w-full rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? 'Saving...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="adjustNote" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Note
            </label>
            <textarea
              id="adjustNote"
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              value={note}
              onChange={event => setNote(event.target.value)}
              disabled={isPending}
              placeholder={
                selectedEmployee ? `Reason for adjusting ${selectedEmployee.fullName}` : 'Reason for adjustment'
              }
            />
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-x-auto">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Employee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Entitled</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adjusted</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Consumed</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(row => (
              <tr key={`${row.employee.id}:${row.year}`}>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-foreground">{row.employee.fullName}</div>
                  <div className="text-xs text-muted-foreground">{row.employee.employeeNumber || '-'}</div>
                </td>
                <td className="px-4 py-3 text-sm text-foreground">{row.year}</td>
                <td className="px-4 py-3 text-sm text-foreground">{row.entitledDays}</td>
                <td className="px-4 py-3 text-sm text-foreground">{row.adjustedDays}</td>
                <td className="px-4 py-3 text-sm text-foreground">{row.consumedDays}</td>
                <td className="px-4 py-3 text-sm font-semibold text-foreground">{row.availableDays}</td>
                <td className="px-4 py-3 text-sm">
                  <a href={`/admin/employees/${row.employee.id}/edit`} className="text-blue-600 hover:text-blue-700 hover:underline">
                    Open Employee
                  </a>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No balance data found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          className="px-4 py-2 rounded-lg border border-border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
          className="px-4 py-2 rounded-lg border border-border text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
