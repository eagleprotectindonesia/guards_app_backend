'use client';

import { useState, useMemo } from 'react';
import Modal from '../../components/modal';
import Select from '../../components/select';
import { X, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { uploadToS3 } from '@/lib/upload';
import { format } from 'date-fns';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';

type BulkReplaceInput = {
  sourceEmployeeId: string;
  targetEmployeeId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  notes?: string;
};

type ReplaceGuardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  shift: Serialized<ShiftWithRelationsDto> | null;
  employees: EmployeeSummary[];
  isPending: boolean;
  isBulkPending?: boolean;
  onSubmit?: (input: {
    shiftId: string;
    replacementEmployeeId: string;
    reason: string;
    notes?: string;
    evidenceS3Key?: string;
  }) => Promise<void>;
  onBulkSubmit?: (input: BulkReplaceInput) => Promise<void>;
};

const REPLACE_REASONS = [
  { value: 'Sick', label: 'Sick' },
  { value: 'Personal Reason', label: 'Personal Reason' },
  { value: 'Family Emergency', label: 'Family Emergency' },
  { value: 'Other', label: 'Other' },
];

function todayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ReplaceGuardModal({
  isOpen,
  isPending,
  isBulkPending,
  shift,
  employees,
  onClose,
  onSubmit,
  onBulkSubmit,
}: ReplaceGuardModalProps) {
  // Single-replace state
  const [replacementEmployeeId, setReplacementEmployeeId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Bulk-replace state
  const [bulkMode, setBulkMode] = useState(false);
  const [guardAId, setGuardAId] = useState<string | null>(null);
  const [guardBId, setGuardBId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<Date>(todayDate);
  const [toDate, setToDate] = useState<Date>(todayDate);

  // Shared state
  const [reason, setReason] = useState<string>('Sick');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleClose = () => {
    setReplacementEmployeeId(null);
    setBulkMode(false);
    setGuardAId(null);
    setGuardBId(null);
    setFromDate(todayDate());
    setToDate(todayDate());
    setReason('Sick');
    setNotes('');
    setUploadedFile(null);
    setUploading(false);
    setUploadError(null);
    setSubmitError(null);
    onClose();
  };

  // Single-replace derived
  const eligibleEmployees = shift
    ? employees.filter(emp => emp.id !== shift.employeeId)
    : employees;
  const replacementOptions = eligibleEmployees.map(emp => ({
    value: emp.id,
    label: emp.fullName,
  }));

  // Bulk-replace derived
  const bulkGuardBOptions = useMemo(
    () =>
      !bulkMode
        ? []
        : employees.filter(emp => emp.id !== guardAId).map(emp => ({ value: emp.id, label: emp.fullName })),
    [employees, guardAId, bulkMode]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadToS3(file, 'shift-replacements');
      setUploadedFile({ key: result.key, name: file.name });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploading(false);
    }
    e.target.value = '';
  };

  const saving = bulkMode ? !!isBulkPending : isPending;
  const canSaveBulk = bulkMode && !!guardAId && !!guardBId && !!fromDate && !!toDate && fromDate <= toDate && !isBulkPending;
  const canSaveSingle = !bulkMode && !!shift && !!replacementEmployeeId && !isPending && !uploading;

  const handleSave = async () => {
    setSubmitError(null);
    try {
      if (bulkMode) {
        if (!guardAId || !guardBId || !fromDate || !toDate) return;
        await onBulkSubmit?.({
          sourceEmployeeId: guardAId,
          targetEmployeeId: guardBId,
          fromDate: dateToStr(fromDate),
          toDate: dateToStr(toDate),
          reason,
          notes: notes.trim() || undefined,
        });
      } else {
        if (!shift || !replacementEmployeeId) return;
        if (!onSubmit) throw new Error('Submit handler not provided');
        await onSubmit({
          shiftId: shift.id,
          replacementEmployeeId,
          reason,
          notes: notes.trim() || undefined,
          evidenceS3Key: uploadedFile?.key,
        });
      }
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (!bulkMode && !shift) return null;

  const title = bulkMode ? 'Bulk Replace' : 'B. Replace Guard';
  const shiftDateTime = shift
    ? `${format(new Date(shift.startsAt), 'yyyy/MM/dd')} ${format(new Date(shift.startsAt), 'HH:mm')} - ${format(new Date(shift.endsAt), 'HH:mm')}`
    : '';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} maxWidthClassName="max-w-md">
      <div className="p-6 space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <input
            type="checkbox"
            id="bulk-replace-mode-chk"
            checked={bulkMode}
            onChange={e => {
              const on = e.target.checked;
              setBulkMode(on);
              if (on) {
                setGuardAId(shift?.employeeId ?? null);
                setGuardBId(null);
                setFromDate(todayDate());
                setToDate(todayDate());
              }
            }}
            disabled={saving}
            className="rounded border-border"
          />
          <label htmlFor="bulk-replace-mode-chk" className="text-sm font-medium text-foreground cursor-pointer select-none">
            Bulk mode — replace all shifts of Guard A with Guard B within a date range
          </label>
        </div>

        {bulkMode ? (
          <>
            {/* Bulk mode: Guard A + Guard B + Date Range */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Guard A (Source) <span className="text-red-500">*</span>
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
                placeholder="Select guard A…"
                isDisabled={isBulkPending}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Guard B (Target) <span className="text-red-500">*</span>
              </label>
              <Select
                options={bulkGuardBOptions}
                value={bulkGuardBOptions.find(o => o.value === guardBId) ?? null}
                onChange={opt => setGuardBId(opt?.value ?? null)}
                placeholder="Select guard B…"
                isDisabled={isBulkPending}
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
                Transfers all shifts of Guard A to Guard B within this range (max 31 days).
              </p>
            </div>
          </>
        ) : (
          <>
            {/* Single-replace mode: existing UI */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Original Guard (Read Only)
              </label>
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
                {shift!.employee?.fullName ?? 'Unassigned'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Replacement Guard <span className="text-red-500">*</span>
              </label>
              <Select
                options={replacementOptions}
                value={replacementOptions.find(o => o.value === replacementEmployeeId) ?? null}
                onChange={opt => setReplacementEmployeeId(opt?.value ?? null)}
                placeholder="Select replacement guard…"
                isDisabled={isPending}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Shift (Read Only)
              </label>
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
                {shiftDateTime}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Evidence (Optional)
              </label>
              {!uploadedFile ? (
                <label className="inline-flex items-center justify-center h-10 px-4 text-sm font-semibold border border-border rounded-lg cursor-pointer hover:bg-muted transition-colors bg-card text-foreground">
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload File'}
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={isPending || uploading}
                    accept="image/*,application/pdf"
                  />
                </label>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-muted text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground max-w-[200px] truncate">{uploadedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setUploadedFile(null)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove file"
                    disabled={isPending}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {uploadError && (
                <p className="text-xs text-red-500 mt-1">{uploadError}</p>
              )}
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <Select
            options={REPLACE_REASONS}
            value={REPLACE_REASONS.find(r => r.value === reason) ?? null}
            onChange={opt => setReason(opt?.value ?? 'Sick')}
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
              bulkMode ? 'Reason for bulk replacement between both guards.' : 'Additional context (optional)'
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
            {saving ? 'Saving...' : bulkMode ? 'Execute Bulk Replace' : 'Save Replacement'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
