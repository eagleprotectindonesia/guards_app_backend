'use client';

import { useRef, useState, useTransition } from 'react';
import Modal from '../../components/modal';
import { bulkCreateOfficeShifts } from '../actions';
import toast from 'react-hot-toast';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function OfficeBulkCreateModal({ isOpen, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const result = await bulkCreateOfficeShifts(formData);
      if (result.success) {
        toast.success(result.message || 'Office shifts created successfully!');
        onClose();
        setFile(null);
        setValidationErrors([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setError(result.message || 'Failed to create office shifts.');
        setValidationErrors(Array.isArray(result.errors) ? result.errors : []);
      }
    });
  };

  const handleDownloadExample = () => {
    const csvContent = 'employee_code,shift_type_name,date,grace_minutes,note\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'office_shifts_example.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Create Office Shifts">
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Upload a CSV with the required headers below.</p>
            <button type="button" onClick={handleDownloadExample} className="text-sm text-blue-600 hover:underline font-medium">
              Download Example
            </button>
          </div>
          <code className="text-xs bg-muted p-2 rounded block border border-border text-foreground">
            employee_code,shift_type_name,date,grace_minutes,note
          </code>
          <p className="text-xs text-muted-foreground">
            Import is all-or-nothing. Multiple same-day office shifts are allowed when they do not overlap.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={event => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
            setValidationErrors([]);
          }}
          className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700"
        />

        {error && <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm border border-red-100">{error}</div>}
        {validationErrors.length > 0 && (
          <div className="p-3 bg-red-50 text-red-700 rounded-md text-sm max-h-40 overflow-y-auto border border-red-100">
            <p className="font-semibold mb-1">Validation Errors:</p>
            <ul className="list-disc pl-5 space-y-1">
              {validationErrors.map((validationError, idx) => (
                <li key={idx}>{validationError}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted" disabled={isPending}>
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50" disabled={!file || isPending}>
            {isPending ? 'Processing...' : 'Upload CSV'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
