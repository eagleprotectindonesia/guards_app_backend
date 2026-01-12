'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { differenceInDays, addDays } from 'date-fns';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';

type AlertExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: Date, endDate: Date) => void;
};

export default function AlertExportModal({ isOpen, onClose, onExport }: AlertExportModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

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

    onExport(startDate, endDate);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-lg w-full max-w-md p-6 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">Export Alerts</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Select a date range to export alert records. The maximum range is 31 days.
        </p>

        <div className="space-y-4">
          {/* Start Date */}
          <div>
            <Label htmlFor="export-start-date" senior-id="export-start-date">Start Date</Label>
            <DatePicker
              date={startDate}
              setDate={setStartDate}
              maxDate={endDate}
              className="mt-1"
            />
          </div>

          {/* End Date */}
          <div>
            <Label htmlFor="export-end-date" senior-id="export-end-date">End Date</Label>
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
          <Button variant="outline" className="flex-1 border-border text-foreground hover:bg-muted" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button className="flex-1 bg-foreground text-background hover:bg-foreground/90 font-bold" onClick={handleExport} type="button">
            Download CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
