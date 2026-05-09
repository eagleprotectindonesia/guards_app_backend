'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import Modal from '../../components/modal';
import toast from 'react-hot-toast';

type OfficeShiftExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialStartDate?: string;
  initialEndDate?: string;
  onExport: (startDate: Date, endDate: Date) => void;
};

export default function OfficeShiftExportModal({
  isOpen,
  onClose,
  title,
  initialStartDate,
  initialEndDate,
  onExport,
}: OfficeShiftExportModalProps) {
  const initialStart = useMemo(() => (initialStartDate ? new Date(initialStartDate) : undefined), [initialStartDate]);
  const initialEnd = useMemo(() => (initialEndDate ? new Date(initialEndDate) : undefined), [initialEndDate]);

  const [startDate, setStartDate] = useState<Date | undefined>(initialStart);
  const [endDate, setEndDate] = useState<Date | undefined>(initialEnd);

  const handleExport = () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates.');
      return;
    }

    if (startDate > endDate) {
      toast.error('Start date cannot be after end date.');
      return;
    }

    onExport(startDate, endDate);
    onClose();
  };

  const handleClose = () => {
    setStartDate(initialStart);
    setEndDate(initialEnd);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-6">Select a date range to export CSV data.</p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="office-shift-export-start-date" className="text-foreground">
              Start Date
            </Label>
            <DatePicker date={startDate} setDate={setStartDate} maxDate={endDate} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="office-shift-export-end-date" className="text-foreground">
              End Date
            </Label>
            <DatePicker date={endDate} setDate={setEndDate} minDate={startDate} className="w-full" />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <Button variant="outline" className="flex-1 font-bold" onClick={handleClose} type="button">
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
