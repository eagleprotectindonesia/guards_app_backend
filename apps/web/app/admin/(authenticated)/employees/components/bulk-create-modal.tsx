'use client';

import { useState, useTransition, useRef } from 'react';
import Modal from '../../components/modal';
import { bulkCreateEmployees } from '../actions';
import toast from 'react-hot-toast';

type BulkCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function BulkCreateModal({ isOpen, onClose }: BulkCreateModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
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
      const result = await bulkCreateEmployees(formData);
      if (result.success) {
        toast.success(result.message || 'Employees created successfully!');
        onClose();
        setFile(null);
        setValidationErrors([]);
      } else {
        setError(result.message || 'Failed to create employees.');
        if (result.errors && Array.isArray(result.errors)) {
          setValidationErrors(result.errors);
        }
      }
    });
  };

  const handleDownloadExample = () => {
    // Create CSV content with headers only
    const csvContent = 'Title,First Name,Last Name,Phone,Employee ID,Employee Code,Note,Join Date (YYYY-MM-DD),Password,Department,Designation,Office\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'employees_example.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Create Employees">
      <form onSubmit={handleSubmit} className="space-y-4 p-4 text-foreground">
        <div>
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with the following columns (headers required):
            </p>
            <button
              type="button"
              onClick={handleDownloadExample}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
            >
              Download Example
            </button>
          </div>
          <code className="text-xs bg-muted p-2 rounded block border border-border whitespace-pre-wrap overflow-x-auto">
            Title, First Name, Last Name, Phone, Employee ID, Employee Code, Note, Join Date (YYYY-MM-DD), Password, Department, Designation, Office
          </code>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Note: Titles must be one of: Mr, Miss, Mrs. Department, Designation, and Office names must match existing records exactly (case-insensitive).
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
              file:bg-blue-50 dark:file:bg-blue-900/20 
              file:text-blue-700 dark:file:text-blue-400
              hover:file:bg-blue-100 dark:hover:file:bg-blue-900/30
              transition-all
            "
          />
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-md text-sm border border-red-100 dark:border-red-900/30">
            {error}
          </div>
        )}

        {validationErrors.length > 0 && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-md text-sm max-h-40 overflow-y-auto border border-red-100 dark:border-red-900/30">
            <p className="font-semibold mb-1">Validation Errors:</p>
            <ul className="list-disc pl-5 space-y-1">
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted transition-colors"
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-background bg-foreground rounded-md hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={!file || isPending}
          >
            {isPending ? 'Processing...' : 'Upload & Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
