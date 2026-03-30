'use client';

import { useRef, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import { bulkScheduleEmployeeOfficeWorkSchedules } from '../actions';
import Modal from '../../components/modal';
import { useRouter } from 'next/navigation';

type BulkScheduleUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function BulkScheduleUploadModal({ isOpen, onClose }: BulkScheduleUploadModalProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setValidationErrors([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const result = await bulkScheduleEmployeeOfficeWorkSchedules(formData);

      if (result.success) {
        toast.success(result.message || 'Office schedule assignments imported successfully.');
        setFile(null);
        setError(null);
        setValidationErrors([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        router.refresh();
        onClose();
        return;
      }

      setError(result.message || 'Failed to import office schedule assignments.');
      setValidationErrors(Array.isArray(result.errors) ? result.errors : []);
    });
  };

  const handleDownloadExample = () => {
    const csvContent = 'employee_code,schedule_name,effective_from\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'office_schedule_assignments_example.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Import Office Schedule Assignments">
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Upload a CSV with the required headers below.</p>
            <button
              type="button"
              onClick={handleDownloadExample}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Download Example
            </button>
          </div>
          <code className="text-xs bg-muted p-2 rounded block border border-border text-foreground">
            employee_number,schedule_name,effective_from
          </code>
          <p className="text-xs text-muted-foreground">
            Import is all-or-nothing. You can include multiple future rows for the same employee, and they will be
            normalized by effective date before save.
          </p>
          <p className="text-xs text-muted-foreground">
            Timeline behavior matches singular scheduling: exact same-date schedule matches are ignored, same-date
            schedule changes are replaced, and earlier or later future rows automatically adjust adjacent effective
            ranges.
          </p>
          <p className="text-xs text-muted-foreground">
            <strong>effective_from format:</strong> YYYY-MM-DD (e.g., 2026-04-01)
          </p>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted-foreground
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              dark:file:bg-blue-900/30 dark:file:text-blue-400
              hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50
            "
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 rounded-md text-sm border border-red-100 dark:border-red-900/50">
            {error}
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="p-3 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 rounded-md text-sm max-h-40 overflow-y-auto border border-red-100 dark:border-red-900/50">
            <p className="font-semibold mb-1">Validation Errors:</p>
            <ul className="list-disc pl-5 space-y-1">
              {validationErrors.map((validationError, idx) => (
                <li key={idx}>{validationError}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted"
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-700 rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!file || isPending}
          >
            {isPending ? 'Processing...' : 'Upload CSV'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
