'use client';

import { useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { useSession } from '../../context/session-context';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { adjustAnnualLeaveBalanceAction } from '../../leave-balances/actions';

type LedgerItem = {
  id: string;
  entryType: 'entitlement' | 'adjustment' | 'deduction' | 'reversal';
  days: number;
  note: string | null;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type Props = {
  employeeId: string;
  employeeName: string;
  year: number;
  balance: {
    entitledDays: number;
    adjustedDays: number;
    consumedDays: number;
    availableDays: number;
  };
  ledger: LedgerItem[];
};

function formatEntryType(entryType: LedgerItem['entryType']) {
  switch (entryType) {
    case 'adjustment':
      return 'Adjustment';
    case 'deduction':
      return 'Deduction';
    case 'entitlement':
      return 'Entitlement';
    case 'reversal':
      return 'Reversal';
    default:
      return entryType;
  }
}

export default function EmployeeLeaveBalanceCard({ employeeId, employeeName, year, balance, ledger }: Props) {
  const { hasPermission } = useSession();
  const canEdit = hasPermission(PERMISSIONS.LEAVE_REQUESTS.EDIT);
  const [days, setDays] = useState<string>('1');
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAdjust = () => {
    const parsedDays = Number(days);
    if (!Number.isInteger(parsedDays) || parsedDays === 0) {
      toast.error('Adjustment days must be a non-zero integer.');
      return;
    }
    if (!note.trim()) {
      toast.error('Adjustment note is required.');
      return;
    }

    startTransition(async () => {
      const result = await adjustAnnualLeaveBalanceAction({
        employeeId,
        year,
        days: parsedDays,
        note: note.trim(),
      });
      if (!result.success) {
        toast.error(result.message || 'Failed to adjust annual leave balance.');
        return;
      }
      toast.success(result.message || 'Annual leave balance adjusted.');
      setDays('1');
      setNote('');
    });
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Annual Leave Balance ({year})</h2>
          <p className="text-sm text-muted-foreground mt-1">{employeeName}</p>
        </div>
        <a
          href={`/admin/leave-balances?employeeId=${employeeId}&year=${year}`}
          className="inline-flex items-center px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/40"
        >
          Open Balance Page
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Entitled</p>
          <p className="text-lg font-semibold text-foreground mt-1">{balance.entitledDays}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Adjusted</p>
          <p className="text-lg font-semibold text-foreground mt-1">{balance.adjustedDays}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Consumed</p>
          <p className="text-lg font-semibold text-foreground mt-1">{balance.consumedDays}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Available</p>
          <p className="text-lg font-semibold text-foreground mt-1">{balance.availableDays}</p>
        </div>
      </div>

      {canEdit && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Adjust Balance</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              value={days}
              onChange={event => setDays(event.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              disabled={isPending}
              placeholder="Days (+/-)"
            />
            <input
              type="text"
              value={note}
              onChange={event => setNote(event.target.value)}
              className="md:col-span-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              disabled={isPending}
              placeholder="Reason for adjustment"
            />
          </div>
          <button
            type="button"
            onClick={handleAdjust}
            disabled={isPending}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Apply Adjustment'}
          </button>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-foreground">Recent Ledger</h3>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">No ledger entries yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {ledger.map(item => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {formatEntryType(item.entryType)}: {item.days > 0 ? `+${item.days}` : item.days} day(s)
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{item.note || '-'}</p>
                <p className="text-xs text-muted-foreground mt-1">By: {item.createdBy?.name || 'System'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
