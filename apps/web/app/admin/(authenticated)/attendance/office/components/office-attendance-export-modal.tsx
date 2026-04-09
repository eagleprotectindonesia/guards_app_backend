'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { differenceInDays, addDays } from 'date-fns';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { AttendanceOfficeSummary } from '@/types/attendance';

type OfficeAttendanceExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: Date, endDate: Date, officeId?: string) => void;
  offices: AttendanceOfficeSummary[];
};

export default function OfficeAttendanceExportModal({
  isOpen,
  onClose,
  onExport,
  offices,
}: OfficeAttendanceExportModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('');

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

    onExport(startDate, endDate, selectedOfficeId || undefined);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-lg w-full max-w-md p-6 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">Export Office Attendance</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Select an office and date range to export office attendance sessions. The maximum range is 31 days.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="office">Office (Optional)</Label>
            <select
              id="office"
              value={selectedOfficeId}
              onChange={e => setSelectedOfficeId(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            >
              <option value="" className="bg-card">All Offices</option>
              {offices.map(office => (
                <option key={office.id} value={office.id} className="bg-card">
                  {office.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="export-start-date">Start Date</Label>
            <DatePicker date={startDate} setDate={setStartDate} maxDate={endDate} className="mt-1" />
          </div>

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
