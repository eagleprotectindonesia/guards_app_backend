'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { differenceInDays, addDays } from 'date-fns';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Guard } from '@prisma/client';
import { Serialized } from '@/lib/utils';

type AttendanceExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: Date, endDate: Date, guardId?: string) => void;
  guards: Serialized<Guard>[];
};

export default function AttendanceExportModal({ isOpen, onClose, onExport, guards }: AttendanceExportModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedGuardId, setSelectedGuardId] = useState<string>('');

  const handleExport = () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates.');
      return;
    }

    if (startDate > endDate) {
      toast.error('Start date cannot be after end date.');
      return;
    }

    const daysDifference = differenceInDays(endDate, startDate);
    if (daysDifference > 31) {
      toast.error('Date range cannot exceed 31 days.');
      return;
    }

    onExport(startDate, endDate, selectedGuardId || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Export Attendance</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Select a date range to export attendance records. The maximum range is 31 days.
        </p>

        <div className="space-y-4">
          {/* Guard Selection */}
          <div>
            <Label htmlFor="guard">Guard (Optional)</Label>
            <select
              id="guard"
              value={selectedGuardId}
              onChange={e => setSelectedGuardId(e.target.value)}
              className="w-full mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Guards</option>
              {guards.map(guard => (
                <option key={guard.id} value={guard.id}>
                  {guard.name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <Label htmlFor="export-start-date">Start Date</Label>
            <DatePicker
              date={startDate}
              setDate={setStartDate}
              maxDate={endDate}
              className="mt-1"
            />
          </div>

          {/* End Date */}
          <div>
            <Label htmlFor="export-end-date">End Date</Label>
            <DatePicker
              date={endDate}
              setDate={setEndDate}
              minDate={startDate}
              maxDate={startDate ? addDays(startDate, 31) : undefined}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleExport} type="button">
            Download CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
