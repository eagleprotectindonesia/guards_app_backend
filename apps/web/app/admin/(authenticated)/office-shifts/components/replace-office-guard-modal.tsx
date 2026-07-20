'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import Select from '../../components/select';
import { DatePicker } from '@/components/ui/date-picker';
import { X, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadToS3 } from '@/lib/upload';
import { format } from 'date-fns';
import type { OfficeShiftWithRelationsDto } from '@/types/office-shifts';
import { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';

type ReplaceOfficeShiftInput = {
  officeShiftId: string;
  replacementEmployeeId: string;
  reason: string;
  notes?: string;
  evidenceS3Key?: string;
};

type BulkSwapInput = {
  employeeAId: string;
  employeeBId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  notes?: string;
};

type ReplaceOfficeGuardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  officeShift: Serialized<OfficeShiftWithRelationsDto> | null;
  employees: EmployeeSummary[];
  isPending: boolean;
  isBulkPending?: boolean;
  onSubmit?: (input: ReplaceOfficeShiftInput) => Promise<void>;
  onBulkSubmit?: (input: BulkSwapInput) => Promise<void>;
};

const REPLACE_REASONS = [
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

export default function ReplaceOfficeGuardModal({
  isOpen,
  isPending,
  isBulkPending,
  officeShift,
  employees,
  onClose,
  onSubmit,
  onBulkSubmit,
}: ReplaceOfficeGuardModalProps) {
  const [replacementEmployeeId, setReplacementEmployeeId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('Sick');
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
    setReplacementEmployeeId(null);
    setUploadedFile(null);
    setUploading(false);
    setUploadError(null);
    setReason('Sick');
    setNotes('');
    setSubmitError(null);
    resetBulk();
    onClose();
  };

  const eligibleEmployees = officeShift ? employees.filter(emp => emp.id !== officeShift.employeeId) : employees;
  const replacementOptions = eligibleEmployees.map(emp => ({
    value: emp.id,
    label: emp.fullName,
  }));

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

  const canSave = !!officeShift && !!replacementEmployeeId && !isPending && !uploading;

  const canSaveBulk =
    bulkMode &&
    !!guardAId &&
    !!guardBId &&
    !!fromDate &&
    !!toDate &&
    new Date(fromDate) <= new Date(toDate) &&
    !(isPending || isBulkPending);

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
      if (!officeShift || !replacementEmployeeId) return;
      if (!onSubmit) throw new Error('Submit handler not provided');
      await onSubmit({
        officeShiftId: officeShift.id,
        replacementEmployeeId,
        reason,
        notes: notes.trim() || undefined,
        evidenceS3Key: uploadedFile?.key,
      });
      handleClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  if (!officeShift && !bulkMode) return null;

  const shiftDateTime = officeShift
    ? `${format(new Date(officeShift.startsAt), 'yyyy/MM/dd')} ${format(
        new Date(officeShift.startsAt),
        'HH:mm'
      )} - ${format(new Date(officeShift.endsAt), 'HH:mm')}`
    : '';

  const bulkGuardBOptions = employees
    .filter(emp => emp.id !== guardAId)
    .map(emp => ({ value: emp.id, label: emp.fullName }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={bulkMode ? 'Bulk Replace Office Shifts' : 'Replace Office Shift Employee'}
      maxWidthClassName="max-w-md"
    >
      <div className="p-6 space-y-4">
        {/* Mode toggle */}
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <input
            type="checkbox"
            id="bulk-replace-mode-chk-office"
            checked={bulkMode}
            onChange={e => {
              const on = e.target.checked;
              setBulkMode(on);
              if (on) {
                setGuardAId(officeShift?.employeeId ?? null);
                setGuardBId(null);
                setFromDate(todayDate());
                setToDate(todayDate());
              } else {
                setReplacementEmployeeId(null);
                setUploadedFile(null);
              }
            }}
            disabled={bulkMode ? !!isBulkPending : isPending}
            className="rounded border-border"
          />
          <label
            htmlFor="bulk-replace-mode-chk-office"
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
                Original Employee (Read Only)
              </label>
              <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
                {officeShift!.employee?.fullName ?? 'Unassigned'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Replacement Employee <span className="text-red-500">*</span>
              </label>
              <Select
                options={replacementOptions}
                value={replacementOptions.find(o => o.value === replacementEmployeeId) ?? null}
                onChange={opt => setReplacementEmployeeId(opt?.value ?? null)}
                placeholder="Select replacement employee…"
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
              {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
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
            placeholder="Additional context (optional)"
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
            {bulkMode ? (isBulkPending ? 'Saving...' : 'Save Bulk Swap') : isPending ? 'Saving...' : 'Save Replacement'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
