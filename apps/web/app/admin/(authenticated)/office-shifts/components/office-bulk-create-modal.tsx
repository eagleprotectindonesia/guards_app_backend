'use client';

import { useRef, useState, useTransition } from 'react';
import Modal from '../../components/modal';
import { bulkCreateOfficeShifts, parseAndValidateOfficeShiftsCSV } from '../actions';
import toast from 'react-hot-toast';
import OfficeBulkCreatePreview, { PreviewData } from './office-bulk-create-preview';
import { AlertCircle, AlertTriangle } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function OfficeBulkCreateModal({ isOpen, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewStep, setPreviewStep] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) {
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError(null);
    setValidationErrors([]);
    setWarnings([]);
    setPreviewData(null);
    setPreviewStep(false);

    // Parse and validate CSV
    const formData = new FormData();
    formData.append('file', selectedFile);

    startTransition(async () => {
      const result = await parseAndValidateOfficeShiftsCSV(formData);
      if (result.success && result.preview) {
        setPreviewData(result.preview);
        setWarnings(result.warnings ?? []);
        setPreviewStep(true);
      } else {
        setError(result.message || 'Failed to parse CSV.');
        setValidationErrors(Array.isArray(result.errors) ? result.errors : []);
      }
    });
  };

  const handleSubmit = () => {
    if (!file || !previewData) {
      setError('Please select a CSV or Excel file and review the preview.');
      return;
    }

    setIsConfirming(true);
    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const result = await bulkCreateOfficeShifts(formData);
      if (result.success) {
        toast.success(result.message || 'Office shifts updated successfully!');
        onClose();
        resetState();
      } else {
        setError(result.message || 'Failed to create office shifts.');
        setValidationErrors(Array.isArray(result.errors) ? result.errors : []);
        setIsConfirming(false);
      }
    });
  };

  const resetState = () => {
    setFile(null);
    setPreviewData(null);
    setPreviewStep(false);
    setValidationErrors([]);
    setWarnings([]);
    setError(null);
    setIsConfirming(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancel = () => {
    if (previewStep) {
      // Go back to file upload step
      setPreviewStep(false);
      setPreviewData(null);
      setError(null);
      setValidationErrors([]);
      setWarnings([]);
    } else {
      onClose();
      resetState();
    }
  };



  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Create Office Shifts"
      maxWidthClassName={previewStep ? 'max-w-5xl' : 'max-w-lg'}
    >
      <div className="p-6">
        {!previewStep ? (
          // Step 1: File Upload
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Upload a CSV or Excel file based on the distributed template.
              </p>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-foreground mb-2">Select CSV or Excel File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={handleFileSelect}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-all cursor-pointer border border-border rounded-lg p-1 bg-muted/30"
                disabled={isPending}
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm border border-red-100 dark:border-red-800/50 flex gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-bold">Error Occurred</p>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm max-h-60 overflow-y-auto border border-red-100 dark:border-red-800/50">
                <p className="font-bold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Validation Issues Found:
                </p>
                <ul className="list-disc pl-5 space-y-1 font-medium">
                  {validationErrors.map((validationError, idx) => (
                    <li key={idx}>{validationError}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-8">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 text-sm font-bold text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-all active:scale-95"
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          // Step 2: Preview
          previewData && (
            <OfficeBulkCreatePreview
              previewData={previewData}
              onBack={handleCancel}
              onConfirm={handleSubmit}
              isPending={isPending}
              isConfirming={isConfirming}
              error={error}
              validationErrors={validationErrors}
              warnings={warnings}
            />
          )
        )}
      </div>
    </Modal>
  );
}
