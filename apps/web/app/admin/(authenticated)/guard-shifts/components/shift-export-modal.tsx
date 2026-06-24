'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { differenceInDays, addDays } from 'date-fns';
import Modal from '../../components/modal';
import toast from 'react-hot-toast';

type ShiftExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onExport: (startDate: Date, endDate: Date, includeDayOffs: boolean) => void;
};

export default function ShiftExportModal({ isOpen, onClose, onExport }: ShiftExportModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [includeDayOffs, setIncludeDayOffs] = useState(false);

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

    onExport(startDate, endDate, includeDayOffs);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Guard Shifts">
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-6">
          Select a date range to export guard shift records. The maximum range is 31 days.
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

          {/* Include Day Offs */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="include-dayoffs"
              checked={includeDayOffs}
              onCheckedChange={(checked) => setIncludeDayOffs(checked === true)}
            />
            <Label htmlFor="include-dayoffs" className="text-sm font-normal cursor-pointer">
              Include day offs
            </Label>
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
