'use client';

import { useMemo, useState } from 'react';
import Modal from '../../components/modal';
import Select from '../../components/select';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';

type SwapShiftModalProps = {
  isOpen: boolean;
  onClose: () => void;
  shiftA: Serialized<ShiftWithRelationsDto> | null;
  employees: EmployeeSummary[];
  shiftsByEmployee: Record<string, Serialized<ShiftWithRelationsDto>[]>;
  isPending: boolean;
  onSubmit: (input: {
    shiftAId: string;
    shiftBId: string;
    reason: string;
    notes?: string;
  }) => Promise<void>;
};

const SWAP_REASONS = [
  { value: 'Sick', label: 'Sick' },
  { value: 'Personal Reason', label: 'Personal Reason' },
  { value: 'Family Emergency', label: 'Family Emergency' },
  { value: 'Other', label: 'Other' },
];

function getShiftPeriodName(startsAt: string | Date): string {
  const start = new Date(startsAt);
  const hour = start.getHours();
  if (hour >= 5 && hour < 12) return 'Pagi';
  if (hour >= 12 && hour < 18) return 'Siang';
  return 'Malam';
}

function formatShiftLabel(shift: Serialized<ShiftWithRelationsDto>): string {
  const start = new Date(shift.startsAt);
  const end = new Date(shift.endsAt);
  const period = getShiftPeriodName(shift.startsAt);
  const time = `${format(start, 'HH')} (${format(start, 'HH:mm')} - ${format(end, 'HH:mm')})`;
  return `${format(start, 'yyyy/MM/dd')} ${period} ${time}`;
}

function sameYmd(a: string | Date, b: string | Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export default function SwapShiftModal({
  isOpen,
  isPending,
  shiftA,
  employees,
  shiftsByEmployee,
  onClose,
  onSubmit,
}: SwapShiftModalProps) {
  const [userGuardBId, setUserGuardBId] = useState<string | null>(null);
  const [userShiftBId, setUserShiftBId] = useState<string | null | undefined>(undefined);
  const [reason, setReason] = useState<string>('Personal Reason');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleClose = () => {
    onClose();
  };

  const guardBOptions = useMemo(() => {
    if (!shiftA) return [];
    return employees
      .filter(emp => emp.id !== shiftA.employeeId)
      .map(emp => ({ value: emp.id, label: emp.fullName }));
  }, [employees, shiftA]);

  const guardBShiftOptions = useMemo(() => {
    if (!shiftA || !userGuardBId) return [];
    const candidates = (shiftsByEmployee[userGuardBId] ?? []).filter(
      s =>
        s.id !== shiftA.id &&
        (s.status === 'scheduled' || s.status === 'in_progress') &&
        sameYmd(s.date, shiftA.date)
    );
    return candidates.map(s => ({
      value: s.id,
      label: `${formatShiftLabel(s)} — ${s.shiftType.name}`,
    }));
  }, [shiftsByEmployee, userGuardBId, shiftA]);

  // Auto-pick the only matching shift when the user has not manually chosen one.
  // This is a pure derivation — no setState — so it's safe during render.
  const guardBId = userGuardBId;
  const shiftBId =
    userShiftBId !== undefined
      ? userShiftBId
      : guardBShiftOptions.length === 1
        ? guardBShiftOptions[0].value
        : null;

  const handleSave = async () => {
    if (!shiftA || !guardBId || !shiftBId) return;
    setSubmitError(null);
    try {
      await onSubmit({
        shiftAId: shiftA.id,
        shiftBId,
        reason,
        notes: notes.trim() || undefined,
      });
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (!shiftA) return null;

  const shiftADateTime = formatShiftLabel(shiftA);
  const shiftBShift = shiftBId
    ? (shiftsByEmployee[guardBId ?? ''] ?? []).find(s => s.id === shiftBId) ?? null
    : null;

  const noMatchingShiftSelected = !!guardBId && guardBShiftOptions.length === 0;
  const canSave =
    !!guardBId && !!shiftBId && guardBShiftOptions.length > 0 && !isPending;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="C. Swap Shift" maxWidthClassName="max-w-md">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Guard A (Original)
          </label>
          <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
            {shiftA.employee?.fullName ?? 'Unassigned'}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Shift A (Read Only)
          </label>
          <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
            {shiftADateTime}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Guard B (Will Swap With) <span className="text-red-500">*</span>
          </label>
          <Select
            options={guardBOptions}
            value={guardBOptions.find(o => o.value === guardBId) ?? null}
            onChange={opt => {
              setUserGuardBId(opt?.value ?? null);
              setUserShiftBId(undefined);
            }}
            placeholder="Select guard to swap with…"
            isDisabled={isPending}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Guard B Shift {guardBShiftOptions.length > 1 ? '*' : ''}
          </label>
          {guardBShiftOptions.length === 0 ? (
            <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-muted-foreground">
              {guardBId ? 'No matching shift on this date' : '—'}
            </div>
          ) : (
            <Select
              options={guardBShiftOptions}
              value={guardBShiftOptions.find(o => o.value === shiftBId) ?? null}
              onChange={opt => setUserShiftBId(opt?.value ?? null)}
              placeholder="Select guard B's shift…"
              isDisabled={isPending || guardBShiftOptions.length === 1}
            />
          )}
          {noMatchingShiftSelected && (
            <p className="text-xs text-red-500 mt-1">
              Selected guard has no shift on {format(new Date(shiftA.date), 'yyyy/MM/dd')}.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <Select
            options={SWAP_REASONS}
            value={SWAP_REASONS.find(r => r.value === reason) ?? null}
            onChange={opt => setReason(opt?.value ?? 'Personal Reason')}
            isDisabled={isPending}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Notes
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 text-sm text-foreground bg-card border border-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all resize-none placeholder:text-muted-foreground/50"
            placeholder="Both guards requested to swap shifts."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isPending}
          />
        </div>

        {submitError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">{submitError}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white"
          >
            {isPending ? 'Saving...' : 'Save Swap'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
