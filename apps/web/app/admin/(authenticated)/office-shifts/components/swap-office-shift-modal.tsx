'use client';

import { useMemo, useState, useEffect } from 'react';
import Modal from '../../components/modal';
import Select from '../../components/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import type { OfficeShiftWithRelationsDto } from '@/types/office-shifts';
import { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';
import { getOfficeShiftSwapCandidateAction } from '../actions';

type SwapInput = { officeShiftAId: string; officeShiftBId: string; reason: string; notes?: string };

type BulkSwapInput = {
  employeeAId: string;
  employeeBId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  notes?: string;
};

type SwapOfficeShiftModalProps = {
  isOpen: boolean;
  onClose: () => void;
  officeShiftA: Serialized<OfficeShiftWithRelationsDto> | null;
  employees: EmployeeSummary[];
  isPending: boolean;
  isBulkPending?: boolean;
  onSubmit?: (input: SwapInput) => Promise<void>;
  onBulkSubmit?: (input: BulkSwapInput) => Promise<void>;
};

const SWAP_REASONS = [
  { value: 'Sick', label: 'Sick' },
  { value: 'Personal Reason', label: 'Personal Reason' },
  { value: 'Family Emergency', label: 'Family Emergency' },
  { value: 'Other', label: 'Other' },
];

function todayDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getShiftPeriodName(startsAt: string | Date): string {
  const start = new Date(startsAt);
  const hour = start.getHours();
  if (hour >= 5 && hour < 12) return 'Pagi';
  if (hour >= 12 && hour < 18) return 'Siang';
  return 'Malam';
}

function formatShiftLabel(shift: Serialized<OfficeShiftWithRelationsDto>): string {
  const start = new Date(shift.startsAt);
  const end = new Date(shift.endsAt);
  const period = getShiftPeriodName(shift.startsAt);
  const time = `${format(start, 'HH')} (${format(start, 'HH:mm')} - ${format(end, 'HH:mm')})`;
  return `${format(start, 'yyyy/MM/dd')} ${period} ${time}`;
}

function isNotPast(date: string | Date): boolean {
  const dateKey = new Date(date).toISOString().slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);
  return dateKey >= todayKey;
}

export default function SwapOfficeShiftModal({
  isOpen,
  isPending,
  isBulkPending,
  officeShiftA,
  employees,
  onClose,
  onSubmit,
  onBulkSubmit,
}: SwapOfficeShiftModalProps) {
  const [userGuardBId, setUserGuardBId] = useState<string | null>(null);
  const [userShiftBId, setUserShiftBId] = useState<string | null | undefined>(undefined);
  const [candidateShifts, setCandidateShifts] = useState<Serialized<OfficeShiftWithRelationsDto>[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [reason, setReason] = useState<string>('Personal Reason');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [guardAId, setGuardAId] = useState<string | null>(null);
  const [guardBId, setGuardBId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<Date>(todayDate());
  const [toDate, setToDate] = useState<Date>(todayDate());

  const resetBulk = () => {
    setBulkMode(false);
    setGuardAId(null);
    setGuardBId(null);
    setFromDate(todayDate());
    setToDate(todayDate());
  };

  const handleClose = () => {
    setUserGuardBId(null);
    setUserShiftBId(undefined);
    setCandidateShifts([]);
    setIsLoadingCandidates(false);
    setReason('Personal Reason');
    setNotes('');
    setSubmitError(null);
    resetBulk();
    onClose();
  };

  // Fetch Guard B's non-past shifts on demand (only when both A and B are chosen).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ready = isOpen && !!officeShiftA && !!userGuardBId;
      if (!ready) {
        setCandidateShifts([]);
        setIsLoadingCandidates(false);
        return;
      }
      setIsLoadingCandidates(true);
      try {
        const res = await getOfficeShiftSwapCandidateAction({
          employeeId: userGuardBId!,
          referenceDate: officeShiftA!.date,
        });
        if (!cancelled) {
          setCandidateShifts(res.success && res.shifts ? res.shifts : []);
        }
      } catch {
        if (!cancelled) setCandidateShifts([]);
      } finally {
        if (!cancelled) setIsLoadingCandidates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, officeShiftA, userGuardBId]);

  const guardBOptions = useMemo(() => {
    if (!officeShiftA) return [];
    return employees
      .filter(emp => emp.id !== officeShiftA.employeeId)
      .map(emp => ({ value: emp.id, label: emp.fullName }));
  }, [employees, officeShiftA]);

  const guardBShiftOptions = useMemo(() => {
    if (!officeShiftA || !userGuardBId) return [];
    const candidates = candidateShifts.filter(
      s => s.id !== officeShiftA.id && (s.status === 'scheduled' || s.status === 'in_progress') && isNotPast(s.date)
    );
    return candidates.map(s => ({
      value: s.id,
      label: `${formatShiftLabel(s)} — ${s.officeShiftType.name}`,
    }));
  }, [candidateShifts, userGuardBId, officeShiftA]);

  const shiftBId =
    userShiftBId !== undefined ? userShiftBId : guardBShiftOptions.length === 1 ? guardBShiftOptions[0].value : null;

  const canSave = !!userGuardBId && !!shiftBId && guardBShiftOptions.length > 0 && !isPending;

  const canSaveBulk =
    bulkMode &&
    !!guardAId &&
    !!guardBId &&
    !!fromDate &&
    !!toDate &&
    new Date(fromDate) <= new Date(toDate) &&
    !(isPending || isBulkPending);

  const bulkGuardBOptions = useMemo(
    () => employees.filter(emp => emp.id !== guardAId).map(emp => ({ value: emp.id, label: emp.fullName })),
    [employees, guardAId]
  );

  const handleSave = async () => {
    setSubmitError(null);
    try {
      if (bulkMode) {
        if (!guardAId || !guardBId) return;
        if (!onBulkSubmit) throw new Error('Bulk submit handler not provided');
        await onBulkSubmit({
          employeeAId: guardAId,
          employeeBId: guardBId,
          fromDate: dateToStr(fromDate),
          toDate: dateToStr(toDate),
          reason,
          notes: notes.trim() || undefined,
        });
        handleClose();
        return;
      }
      if (!officeShiftA || !userGuardBId || !shiftBId) return;
      if (!onSubmit) throw new Error('Submit handler not provided');
      await onSubmit({
        officeShiftAId: officeShiftA.id,
        officeShiftBId: shiftBId,
        reason,
        notes: notes.trim() || undefined,
      });
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (!officeShiftA && !bulkMode) return null;

  const noMatchingShiftSelected = !!userGuardBId && !isLoadingCandidates && guardBShiftOptions.length === 0;
  const title = bulkMode ? 'Bulk Swap Office Shifts' : 'Swap Office Shift';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} maxWidthClassName="max-w-md">
      <div className="p-6 space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <input
            type="checkbox"
            id="bulk-mode-chk-office"
            checked={bulkMode}
            onChange={e => {
              const on = e.target.checked;
              setBulkMode(on);
              if (on) {
                setGuardAId(officeShiftA?.employeeId ?? null);
                setGuardBId(null);
                setFromDate(todayDate());
                setToDate(todayDate());
              } else {
                setUserGuardBId(null);
                setUserShiftBId(undefined);
                setCandidateShifts([]);
              }
            }}
            disabled={bulkMode ? !!isBulkPending : isPending}
            className="rounded border-border"
          />
          <label
            htmlFor="bulk-mode-chk-office"
            className="text-sm font-medium text-foreground cursor-pointer select-none"
          >
            Bulk mode — swap &amp; replace all shifts between two employees within a date range
          </label>
        </div>

        {bulkMode ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Employee A <span className="text-red-500">*</span>
              </label>
              <Select
                options={employees.map(emp => ({ value: emp.id, label: emp.fullName }))}
                value={
                  employees.find(emp => emp.id === guardAId)
                    ? { value: guardAId!, label: employees.find(emp => emp.id === guardAId)!.fullName }
                    : null
                }
                onChange={opt => {
                  setGuardAId(opt?.value ?? null);
                  setGuardBId(null);
                }}
                placeholder="Select employee A…"
                isDisabled={!!isBulkPending}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Employee B <span className="text-red-500">*</span>
              </label>
              <Select
                options={bulkGuardBOptions}
                value={bulkGuardBOptions.find(o => o.value === guardBId) ?? null}
                onChange={opt => setGuardBId(opt?.value ?? null)}
                placeholder="Select employee B…"
                isDisabled={!!isBulkPending}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Date Range <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <DatePicker
                    date={fromDate}
                    setDate={d => {
                      if (d) {
                        setFromDate(d);
                        if (toDate < d) setToDate(d);
                      }
                    }}
                    minDate={todayDate()}
                    placeholder="From"
                  />
                </div>
                <span className="text-muted-foreground text-sm shrink-0">—</span>
                <div className="flex-1 min-w-0">
                  <DatePicker
                    date={toDate}
                    setDate={d => d && setToDate(d)}
                    minDate={fromDate}
                    maxDate={(() => {
                      const max = new Date(fromDate);
                      max.setDate(max.getDate() + 31);
                      return max;
                    })()}
                    placeholder="To"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Shifts lined up by time are swapped; the rest are reassigned. Max 31 days.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Employee A (Original)
              </label>
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
                {officeShiftA!.employee?.fullName ?? 'Unassigned'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Shift A (Read Only)
              </label>
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
                {formatShiftLabel(officeShiftA!)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Employee B (Will Swap With) <span className="text-red-500">*</span>
              </label>
              <Select
                options={guardBOptions}
                value={guardBOptions.find(o => o.value === userGuardBId) ?? null}
                onChange={opt => {
                  setUserGuardBId(opt?.value ?? null);
                  setUserShiftBId(undefined);
                }}
                placeholder="Select employee to swap with…"
                isDisabled={isPending}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Employee B Shift {guardBShiftOptions.length > 1 ? '*' : ''}
              </label>
              {guardBShiftOptions.length === 0 ? (
                <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-muted-foreground">
                  {!userGuardBId ? '—' : isLoadingCandidates ? 'Loading shifts…' : 'No eligible (future) shift found'}
                </div>
              ) : (
                <Select
                  options={guardBShiftOptions}
                  value={guardBShiftOptions.find(o => o.value === shiftBId) ?? null}
                  onChange={opt => setUserShiftBId(opt?.value ?? null)}
                  placeholder="Select employee B's shift…"
                  isDisabled={isPending || guardBShiftOptions.length === 1}
                />
              )}
              {noMatchingShiftSelected && (
                <p className="text-xs text-red-500 mt-1">
                  Selected employee has no eligible (non-past) shift available.
                </p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <Select
            options={SWAP_REASONS}
            value={SWAP_REASONS.find(r => r.value === reason) ?? null}
            onChange={opt => setReason(opt?.value ?? 'Personal Reason')}
            isDisabled={isPending || !!isBulkPending}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Notes
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 text-sm text-foreground bg-card border border-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all resize-none placeholder:text-muted-foreground/50"
            placeholder="Both employees requested to swap shifts."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isPending || !!isBulkPending}
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
            disabled={isPending || !!isBulkPending}
            className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <Button
            onClick={handleSave}
            disabled={bulkMode ? !canSaveBulk : !canSave}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white"
          >
            {bulkMode ? (isBulkPending ? 'Saving...' : 'Save Bulk Swap') : isPending ? 'Saving...' : 'Save Swap'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
