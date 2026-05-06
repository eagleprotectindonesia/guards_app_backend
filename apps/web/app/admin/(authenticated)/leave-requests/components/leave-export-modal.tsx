'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import Modal from '../../components/modal';
import toast from 'react-hot-toast';

type LeaveExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
  onExport: (startDate?: Date, endDate?: Date) => void;
};

export default function LeaveExportModal({
  isOpen,
  onClose,
  initialStartDate,
  initialEndDate,
  onExport,
}: LeaveExportModalProps) {
  const initialStart = useMemo(() => (initialStartDate ? new Date(initialStartDate) : undefined), [initialStartDate]);
  const initialEnd = useMemo(() => (initialEndDate ? new Date(initialEndDate) : undefined), [initialEndDate]);

  const [startDate, setStartDate] = useState<Date | undefined>(initialStart);
  const [endDate, setEndDate] = useState<Date | undefined>(initialEnd);

  const handleExport = () => {
    if (startDate && endDate && startDate > endDate) {
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
    <Modal isOpen={isOpen} onClose={handleClose} title="Export Leave Requests">
      <div className="p-6">
        <p className="text-sm text-muted-foreground mb-6">Date range is optional. Leave empty to export all matching records.</p>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="leave-export-start-date" className="text-foreground">
              Start Date (Optional)
            </Label>
            <DatePicker date={startDate} setDate={setStartDate} maxDate={endDate} className="w-full" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="leave-export-end-date" className="text-foreground">
              End Date (Optional)
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
