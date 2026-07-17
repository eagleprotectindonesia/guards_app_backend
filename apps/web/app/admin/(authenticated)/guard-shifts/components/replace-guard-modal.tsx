'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import Select from '../../components/select';
import { X, FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadToS3 } from '@/lib/upload';
import { format } from 'date-fns';
import type { ShiftWithRelationsDto } from '@/types/shifts';
import { Serialized } from '@/lib/server-utils';
import type { EmployeeSummary } from '@repo/database';

type ReplaceGuardModalProps = {
  isOpen: boolean;
  onClose: () => void;
  shift: Serialized<ShiftWithRelationsDto> | null;
  employees: EmployeeSummary[];
  isPending: boolean;
  onSubmit: (input: {
    shiftId: string;
    replacementEmployeeId: string;
    reason: string;
    notes?: string;
    evidenceS3Key?: string;
  }) => Promise<void>;
};

const REPLACE_REASONS = [
  { value: 'Sick', label: 'Sick' },
  { value: 'Personal Reason', label: 'Personal Reason' },
  { value: 'Family Emergency', label: 'Family Emergency' },
  { value: 'Other', label: 'Other' },
];

export default function ReplaceGuardModal({
  isOpen,
  isPending,
  shift,
  employees,
  onClose,
  onSubmit,
}: ReplaceGuardModalProps) {
  const [replacementEmployeeId, setReplacementEmployeeId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('Sick');
  const [notes, setNotes] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleClose = () => {
    setReplacementEmployeeId(null);
    setReason('Sick');
    setNotes('');
    setUploadedFile(null);
    setUploading(false);
    setUploadError(null);
    setSubmitError(null);
    onClose();
  };

  const eligibleEmployees = shift
    ? employees.filter(emp => emp.id !== shift.employeeId)
    : employees;
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

  const handleSave = async () => {
    if (!shift || !replacementEmployeeId) return;
    setSubmitError(null);
    try {
      await onSubmit({
        shiftId: shift.id,
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

  if (!shift) return null;

  const shiftDateTime = `${format(new Date(shift.startsAt), 'yyyy/MM/dd')} ${format(new Date(shift.startsAt), 'HH:mm')} - ${format(new Date(shift.endsAt), 'HH:mm')}`;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="B. Replace Guard" maxWidthClassName="max-w-md">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Original Guard (Read Only)
          </label>
          <div className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-muted text-foreground">
            {shift.employee?.fullName ?? 'Unassigned'}
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
            Reason <span className="text-red-500">*</span>
          </label>
          <Select
            options={REPLACE_REASONS}
            value={REPLACE_REASONS.find(r => r.value === reason) ?? null}
            onChange={opt => setReason(opt?.value ?? 'Sick')}
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
            placeholder="Additional context (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={isPending}
          />
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
            disabled={!replacementEmployeeId || isPending || uploading}
            className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 text-white"
          >
            {isPending ? 'Saving...' : 'Save Replacement'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
