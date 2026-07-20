'use client';

import { useMemo, useState, useEffect } from 'react';
import Modal from '../../components/modal';
import Select from '../../components/select';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { format } from 'date-fns';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';
import { getSwapCandidateShiftsAction } from '../actions';

type SwapInput = { shiftAId: string; shiftBId: string; reason: string; notes?: string };
type BulkSwapInput = {
  employeeAId: string;
  employeeBId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  notes?: string;
};

type SwapShiftModalProps = {
  isOpen: boolean;
  onClose: () => void;
  shiftA: Serialized<ShiftWithRelationsDto> | null;
  employees: EmployeeSummary[];
  isPending: boolean;
  isBulkSwapPending?: boolean;
  onSubmit?: (input: SwapInput) => Promise<void>;
  onBulkSubmit?: (input: BulkSwapInput) => Promise<void>;
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

function isNotPast(date: string | Date): boolean {
  const dateKey = new Date(date).toISOString().slice(0, 10);
  const todayKey = new Date().toISOString().slice(0, 10);
  return dateKey >= todayKey;
}

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SwapShiftModal({
  isOpen,
  isPending,
  isBulkSwapPending,
  shiftA,
  employees,
  onClose,
  onSubmit,
  onBulkSubmit,
}: SwapShiftModalProps) {
  // Single-swap state
  const [userGuardBId, setUserGuardBId] = useState<string | null>(null);
  const [userShiftBId, setUserShiftBId] = useState<string | null | undefined>(undefined);
  const [candidateShifts, setCandidateShifts] = useState<Serialized<ShiftWithRelationsDto>[]>([]);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);

  // Bulk-swap state
  const [guardAId, setGuardAId] = useState<string | null>(null);
  const [guardBId, setGuardBId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<Date>(todayDate);
  const [toDate, setToDate] = useState<Date>(todayDate);

  // Shared state
  const [bulkMode, setBulkMode] = useState(false);
  const [reason, setReason] = useState<string>('Personal Reason');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleClose = () => {
    onClose();
  };

  // Fetch Guard B's non-past shifts on demand (single-swap mode only).
  useEffect(() => {
    if (bulkMode) return;
    let cancelled = false;
    void (async () => {
      const ready = isOpen && !!shiftA && !!userGuardBId;
      if (!ready) {
        setCandidateShifts([]);
        setIsLoadingCandidates(false);
        return;
      }
      setIsLoadingCandidates(true);
      try {
        const res = await getSwapCandidateShiftsAction({
          employeeId: userGuardBId!,
          referenceDate: shiftA!.date,
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
  }, [isOpen, bulkMode, shiftA, userGuardBId]);

  // --- Single-swap derived values ---
  const guardBOptions = useMemo(() => {
    if (bulkMode) return [];
    if (!shiftA) return [];
    return employees.filter(emp => emp.id !== shiftA.employeeId).map(emp => ({ value: emp.id, label: emp.fullName }));
  }, [employees, shiftA, bulkMode]);

  const guardBShiftOptions = useMemo(() => {
    if (bulkMode || !shiftA || !userGuardBId) return [];
    const candidates = candidateShifts.filter(
      s => s.id !== shiftA.id && (s.status === 'scheduled' || s.status === 'in_progress') && isNotPast(s.date)
    );
    return candidates.map(s => ({
      value: s.id,
      label: `${formatShiftLabel(s)} — ${s.shiftType.name}`,
    }));
  }, [candidateShifts, userGuardBId, shiftA, bulkMode]);

  const singleGuardBId = userGuardBId;
  const shiftBId =
    userShiftBId !== undefined ? userShiftBId : guardBShiftOptions.length === 1 ? guardBShiftOptions[0].value : null;

  // --- Bulk-swap derived values ---
  const bulkGuardBOptions = useMemo(() => {
    if (!bulkMode) return [];
    return employees.filter(emp => emp.id !== guardAId).map(emp => ({ value: emp.id, label: emp.fullName }));
  }, [employees, guardAId, bulkMode]);

  const canSaveBulk =
    bulkMode && !!guardAId && !!guardBId && !!fromDate && !!toDate && fromDate <= toDate && !isBulkSwapPending;
  const canSaveSingle = !bulkMode && !!singleGuardBId && !!shiftBId && guardBShiftOptions.length > 0 && !isPending;

  const handleSave = async () => {
    setSubmitError(null);
    try {
      if (bulkMode) {
        if (!guardAId || !guardBId || !fromDate || !toDate) return;
        await onBulkSubmit?.({
          employeeAId: guardAId,
          employeeBId: guardBId,
          fromDate: dateToStr(fromDate),
          toDate: dateToStr(toDate),
          reason,
          notes: notes.trim() || undefined,
        });
      } else {
        if (!shiftA || !singleGuardBId || !shiftBId) return;
        if (!onSubmit) throw new Error('Submit handler not provided');
        await onSubmit({
          shiftAId: shiftA.id,
          shiftBId,
          reason,
          notes: notes.trim() || undefined,
        });
      }
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (!bulkMode && !shiftA) return null;

  const saving = bulkMode ? !!isBulkSwapPending : isPending;
  const title = bulkMode ? 'Bulk Swap' : 'Swap Shift';
  const noMatchingShiftSelected = !!singleGuardBId && !isLoadingCandidates && guardBShiftOptions.length === 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} maxWidthClassName="max-w-md">
      <div className="p-6 space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <input
            type="checkbox"
            id="bulk-mode-chk"
            checked={bulkMode}
            onChange={e => {
              const on = e.target.checked;
              setBulkMode(on);
              if (on) {
                setGuardAId(shiftA?.employeeId ?? null);
                setGuardBId(null);
                setFromDate(todayDate());
                setToDate(todayDate());
              } else {
                setUserGuardBId(null);
                setUserShiftBId(undefined);
                setCandidateShifts([]);
              }
            }}
            disabled={bulkMode ? !!isBulkSwapPending : isPending}
            className="rounded border-border"
          />
          <label htmlFor="bulk-mode-chk" className="text-sm font-medium text-foreground cursor-pointer select-none">
            Bulk mode — swap all shifts between two guards within a date range
          </label>
        </div>

        {bulkMode ? (
          <>
            {/* Bulk mode: Guard A + Guard B + Date Range */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Guard A <span className="text-red-500">*</span>
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
                  setGuardBId(null); // reset B when A changes
                }}
                placeholder="Select guard A…"
                isDisabled={isBulkSwapPending}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Guard B <span className="text-red-500">*</span>
              </label>
              <Select
                options={bulkGuardBOptions}
                value={bulkGuardBOptions.find(o => o.value === guardBId) ?? null}
                onChange={opt => setGuardBId(opt?.value ?? null)}
                placeholder="Select guard B…"
                isDisabled={isBulkSwapPending}
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
                Transfers all shifts of Guard A ↔ Guard B within this range (max 31 days).
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Single-swap mode: existing UI */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Guard A (Original)
              </label>
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
                {shiftA!.employee?.fullName ?? 'Unassigned'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Shift A (Read Only)
              </label>
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
                {formatShiftLabel(shiftA!)}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Guard B (Will Swap With) <span className="text-red-500">*</span>
              </label>
              <Select
                options={guardBOptions}
                value={guardBOptions.find(o => o.value === singleGuardBId) ?? null}
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
                  {!singleGuardBId ? '—' : isLoadingCandidates ? 'Loading shifts…' : 'No eligible (future) shift found'}
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
                <p className="text-xs text-red-500 mt-1">Selected guard has no eligible (non-past) shift available.</p>
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
            isDisabled={saving}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Notes
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 text-sm text-foreground bg-card border border-border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all resize-none placeholder:text-muted-foreground/50"
            placeholder={
              bulkMode ? 'Reason for bulk swap between both guards.' : 'Both guards requested to swap shifts.'
            }
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={saving}
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
            disabled={saving}
            className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors text-foreground disabled:opacity-50"
          >
            Cancel
          </button>
          <Button
            onClick={handleSave}
            disabled={bulkMode ? !canSaveBulk : !canSaveSingle}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white"
          >
            {saving ? 'Saving...' : bulkMode ? 'Execute Bulk Swap' : 'Save Swap'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
