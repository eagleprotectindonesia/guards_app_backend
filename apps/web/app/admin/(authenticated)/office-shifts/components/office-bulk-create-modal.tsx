'use client';

import { useRef, useState, useTransition } from 'react';
import Modal from '../../components/modal';
import { bulkCreateOfficeShifts, parseAndValidateOfficeShiftsCSV } from '../actions';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

interface ShiftPreviewData {
  date: string;
  shiftTypeName: string;
  startTime: string;
  endTime: string;
  note?: string | null;
  isDayOff: boolean;
}

interface EmployeePreviewData {
  employeeCode: string;
  employeeName: string;
  employeeId: string;
  firstDate: string;
  lastDate: string;
  totalShifts: number;
  shifts: ShiftPreviewData[];
}

interface PreviewData {
  employees: EmployeePreviewData[];
  totalShiftsToCreate: number;
  totalEmployees: number;
  dateRange: {
    start: string;
    end: string;
  };
}

export default function OfficeBulkCreateModal({ isOpen, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewStep, setPreviewStep] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
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
    setPreviewData(null);
    setPreviewStep(false);

    // Parse and validate CSV
    const formData = new FormData();
    formData.append('file', selectedFile);

    startTransition(async () => {
      const result = await parseAndValidateOfficeShiftsCSV(formData);
      if (result.success && result.preview) {
        setPreviewData(result.preview);
        setPreviewStep(true);
        // Expand all employees by default
        setExpandedEmployees(new Set(result.preview.employees.map(e => e.employeeId)));
      } else {
        setError(result.message || 'Failed to parse CSV.');
        setValidationErrors(Array.isArray(result.errors) ? result.errors : []);
      }
    });
  };

  const handleSubmit = () => {
    if (!file || !previewData) {
      setError('Please select a CSV file and review the preview.');
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
    setError(null);
    setIsConfirming(false);
    setExpandedEmployees(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCancel = () => {
    if (previewStep) {
      // Go back to file upload step
      setPreviewStep(false);
      setPreviewData(null);
      setError(null);
      setValidationErrors([]);
    } else {
      onClose();
      resetState();
    }
  };

  const toggleEmployee = (employeeId: string) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  const handleDownloadExample = () => {
    const csvContent = 'employee_code,shift_type_name,date,note\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'office_shifts_example.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Create Office Shifts">
      <div className="p-4">
        {!previewStep ? (
          // Step 1: File Upload
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Upload a CSV with the required headers below.</p>
                <button type="button" onClick={handleDownloadExample} className="text-sm text-blue-600 hover:underline font-medium">
                  Download Example
                </button>
              </div>
              <code className="text-xs bg-muted p-2 rounded block border border-border text-foreground">
                employee_code,shift_type_name,date,note
              </code>
              <p className="text-xs text-muted-foreground">
                Import is all-or-nothing. Use a shift type to create a scheduled shift, or `OFF` to mark the employee
                unavailable for that date. Multiple same-day office shifts are allowed when they do not overlap.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700"
              disabled={isPending}
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
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted"
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          // Step 2: Preview
          <div className="space-y-4">
            {previewData && (
              <>
                {/* Summary Section */}
                <div className="bg-muted/50 rounded-lg p-4 border border-border">
                  <h3 className="font-semibold text-foreground mb-3">Summary</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Total Employees</p>
                      <p className="text-lg font-bold text-foreground">{previewData.totalEmployees}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Shifts</p>
                      <p className="text-lg font-bold text-foreground">{previewData.totalShiftsToCreate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Date Range</p>
                      <p className="text-sm font-semibold text-foreground">
                        {formatDate(previewData.dateRange.start)} - {formatDate(previewData.dateRange.end)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Employee Shifts */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-foreground text-sm">Employee Shifts (sorted by employee code)</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {previewData.employees.map(employee => (
                      <div
                        key={employee.employeeId}
                        className="border border-border rounded-lg bg-card overflow-hidden"
                      >
                        {/* Employee Header */}
                        <button
                          type="button"
                          onClick={() => toggleEmployee(employee.employeeId)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`transform transition-transform ${expandedEmployees.has(employee.employeeId) ? 'rotate-90' : ''}`}>
                              ▶
                            </span>
                            <div className="text-left">
                              <p className="font-semibold text-foreground">
                                {employee.employeeCode} - {employee.employeeName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(employee.firstDate)} - {formatDate(employee.lastDate)} ({employee.shifts.length} days)
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">{employee.totalShifts} shifts</p>
                            <p className="text-xs text-muted-foreground">{employee.shifts.filter(s => s.isDayOff).length} days off</p>
                          </div>
                        </button>

                        {/* Shift Table */}
                        {expandedEmployees.has(employee.employeeId) && (
                          <div className="border-t border-border">
                            <div className="max-h-64 overflow-y-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50 sticky top-0">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Shift Type</th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Time</th>
                                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {employee.shifts.map((shift, idx) => (
                                    <tr
                                      key={shift.date}
                                      className={shift.isDayOff ? 'bg-muted/30' : idx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}
                                    >
                                      <td className="px-4 py-2 text-foreground">{formatDate(shift.date)}</td>
                                      <td className="px-4 py-2 text-foreground">{shift.shiftTypeName}</td>
                                      <td className="px-4 py-2 text-muted-foreground">
                                        {shift.isDayOff ? '—' : `${shift.startTime} - ${shift.endTime}`}
                                      </td>
                                      <td className="px-4 py-2">
                                        {shift.isDayOff ? (
                                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                                            🌴 Day Off
                                          </span>
                                        ) : (
                                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                                            ✓ Scheduled
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted"
                    disabled={isPending || isConfirming}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    disabled={isPending || isConfirming}
                  >
                    {isConfirming ? 'Creating...' : 'Confirm & Upload'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
