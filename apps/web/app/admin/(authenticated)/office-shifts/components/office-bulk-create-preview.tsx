'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronRight, Calendar, Loader2, CheckCircle2, Palmtree, AlertCircle, AlertTriangle } from 'lucide-react';

export interface ShiftPreviewData {
  date: string;
  shiftTypeName: string;
  startTime: string;
  endTime: string;
  note?: string | null;
  isDayOff: boolean;
}

export interface EmployeePreviewData {
  employeeCode: string;
  employeeName: string;
  employeeId: string;
  firstDate: string;
  lastDate: string;
  totalShifts: number;
  shifts: ShiftPreviewData[];
}

export interface PreviewData {
  employees: EmployeePreviewData[];
  totalShiftsToCreate: number;
  totalEmployees: number;
  dateRange: {
    start: string;
    end: string;
  };
}

interface Props {
  previewData: PreviewData;
  onBack: () => void;
  onConfirm: () => void;
  isPending: boolean;
  isConfirming: boolean;
  error?: string | null;
  validationErrors?: string[];
}

export default function OfficeBulkCreatePreview({
  previewData,
  onBack,
  onConfirm,
  isPending,
  isConfirming,
  error,
  validationErrors = [],
}: Props) {
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(
    new Set(previewData.employees.map(e => e.employeeId))
  );

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

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Errors Section */}
      {(error || validationErrors.length > 0) && (
        <div className="space-y-3">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm border border-red-100 dark:border-red-800/50 flex gap-3 shadow-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">Error Occurred</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm max-h-60 overflow-y-auto border border-red-100 dark:border-red-800/50 shadow-sm">
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
        </div>
      )}

      {/* Summary Section */}
      <div className="bg-muted/50 rounded-xl p-6 border border-border shadow-sm">
        <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
          <span className="bg-blue-600 w-1 h-5 rounded-full" />
          Import Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Employees</p>
            <p className="text-2xl font-black text-foreground mt-1">{previewData.totalEmployees}</p>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Shifts</p>
            <p className="text-2xl font-black text-foreground mt-1">{previewData.totalShiftsToCreate}</p>
          </div>
          <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date Range</p>
            <p className="text-base font-bold text-foreground mt-1">
              {formatDate(previewData.dateRange.start)} — {formatDate(previewData.dateRange.end)}
            </p>
          </div>
        </div>
      </div>

      {/* Employee Shifts */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <span className="bg-blue-600 w-1 h-5 rounded-full" />
            Employee Shifts Detail
          </h3>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md border border-border">
            Sorted by employee code
          </span>
        </div>
        
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {previewData.employees.map(employee => (
            <div
              key={employee.employeeId}
              className="border border-border rounded-xl bg-card overflow-hidden shadow-sm hover:border-blue-500/50 transition-colors"
            >
              {/* Employee Header */}
              <button
                type="button"
                onClick={() => toggleEmployee(employee.employeeId)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-1 rounded-md bg-muted transition-transform duration-200 ${expandedEmployees.has(employee.employeeId) ? 'rotate-90' : ''}`}>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-lg text-foreground">
                      {employee.employeeCode} <span className="text-muted-foreground mx-1">—</span> {employee.employeeName}
                    </p>
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(employee.firstDate)} — {formatDate(employee.lastDate)} ({employee.shifts.length} days)
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{employee.totalShifts} shifts</p>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-tight">
                      {employee.shifts.filter(s => s.isDayOff).length} days off
                    </p>
                  </div>
                </div>
              </button>

              {/* Shift Table */}
              {expandedEmployees.has(employee.employeeId) && (
                <div className="border-t border-border bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-left border-b border-border">
                          <th className="px-6 py-3 font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Date</th>
                          <th className="px-6 py-3 font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Shift Type</th>
                          <th className="px-6 py-3 font-bold text-muted-foreground uppercase tracking-wider text-[11px]">Time Window</th>
                          <th className="px-6 py-3 font-bold text-muted-foreground uppercase tracking-wider text-[11px] text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {employee.shifts.map((shift) => (
                          <tr
                            key={shift.date}
                            className={`transition-colors ${shift.isDayOff ? 'bg-emerald-500/3' : 'hover:bg-muted/20'}`}
                          >
                            <td className="px-6 py-4 font-semibold text-foreground">{formatDate(shift.date)}</td>
                            <td className="px-6 py-4 font-medium text-foreground">{shift.shiftTypeName}</td>
                            <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                              {shift.isDayOff ? (
                                <span className="italic opacity-50">—</span>
                              ) : (
                                <span className="bg-muted px-2 py-0.5 rounded border border-border">
                                  {shift.startTime} - {shift.endTime}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {shift.isDayOff ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full text-xs font-bold ring-1 ring-inset ring-emerald-600/20">
                                  <Palmtree className="w-3 h-3" />
                                  Day Off
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-xs font-bold ring-1 ring-inset ring-blue-600/20">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Scheduled
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
      <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2.5 text-sm font-bold text-foreground bg-card border border-border rounded-lg hover:bg-muted transition-all active:scale-95"
          disabled={isPending || isConfirming}
        >
          Back to Upload
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-8 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
          disabled={isPending || isConfirming}
        >
          {isConfirming ? (
            <>
              <Loader2 className="animate-spin h-4 w-4" />
              Processing...
            </>
          ) : (
            'Confirm & Upload Shifts'
          )}
        </button>
      </div>
    </div>
  );
}
