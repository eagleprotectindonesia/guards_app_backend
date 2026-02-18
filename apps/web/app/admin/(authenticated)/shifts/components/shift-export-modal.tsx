'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { differenceInDays, addDays } from 'date-fns';
import Modal from '../../components/modal';
import toast from 'react-hot-toast';

type ShiftExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: Date, endDate: Date) => void;
};

export default function ShiftExportModal({ isOpen, onClose, onExport }: ShiftExportModalProps) {
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Shifts">
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-6">
          Select a date range to export shift records. The maximum range is 31 days.
        </p>

        <div className="space-y-4">
          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="export-start-date" className="text-foreground">
              Start Date
            </Label>
            <DatePicker date={startDate} setDate={setStartDate} maxDate={endDate} className="w-full" />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label htmlFor="export-end-date" className="text-foreground">
              End Date
            </Label>
            <DatePicker
              date={endDate}
              setDate={setEndDate}
              minDate={startDate}
              maxDate={startDate ? addDays(startDate, 31) : undefined}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <Button variant="outline" className="flex-1 font-bold" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button className="flex-1 font-bold" onClick={handleExport} type="button">
            Download CSV
          </Button>
        </div>
      </div>
    </Modal>
  );
}
