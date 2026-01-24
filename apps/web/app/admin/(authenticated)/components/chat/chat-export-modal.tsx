'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { differenceInDays, addDays } from 'date-fns';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

type ChatExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: Date, endDate: Date, employeeId: string) => void;
  employees: { id: string; fullName: string }[];
  initialEmployeeId?: string;
};

export default function ChatExportModal({ 
  isOpen, 
  onClose, 
  onExport, 
  employees,
  initialEmployeeId 
}: ChatExportModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId || '');

  // Update selected employee if initialEmployeeId changes and modal opens
  if (isOpen && initialEmployeeId && selectedEmployeeId === '' && initialEmployeeId !== selectedEmployeeId) {
     setSelectedEmployeeId(initialEmployeeId);
  }

  const handleExport = () => {
    if (!selectedEmployeeId) {
      toast.error('Please select an employee.');
      return;
    }

    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates.');
      return;
    }

    if (startDate > endDate) {
      toast.error('Start date cannot be after end date.');
      return;
    }

    const daysDifference = differenceInDays(endDate, startDate);
    if (daysDifference > 62) {
      toast.error('Date range cannot exceed 62 days.');
      return;
    }

    onExport(startDate, endDate, selectedEmployeeId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-lg w-full max-w-md p-6 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">Export Chat History (ZIP)</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Select an employee and date range to export chat history and attachments.
        </p>

        <div className="space-y-4">
          {/* Employee Selection */}
          <div>
            <Label htmlFor="employee">Employee <span className="text-red-500">*</span></Label>
            <select
              id="employee"
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            >
              <option value="" disabled className="bg-card">Select an Employee</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id} className="bg-card">
                  {employee.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <Label htmlFor="export-start-date">Start Date <span className="text-red-500">*</span></Label>
            <DatePicker
              date={startDate}
              setDate={setStartDate}
              maxDate={endDate}
              className="mt-1"
            />
          </div>

          {/* End Date */}
          <div>
            <Label htmlFor="export-end-date">End Date <span className="text-red-500">*</span></Label>
            <DatePicker
              date={endDate}
              setDate={setEndDate}
              minDate={startDate}
              maxDate={startDate ? addDays(startDate, 62) : undefined}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleExport} type="button">
            Download ZIP
          </Button>
        </div>
      </div>
    </div>
  );
}
