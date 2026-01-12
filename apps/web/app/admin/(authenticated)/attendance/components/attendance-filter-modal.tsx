'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { Serialized } from '@/lib/utils';
import { X } from 'lucide-react';
import { Guard } from '@prisma/client';

type AttendanceFilterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: { startDate?: Date; endDate?: Date; guardId: string }) => void;
  initialFilters: {
    startDate?: string;
    endDate?: string;
    guardId?: string;
  };
  guards: Serialized<Guard>[];
};

export default function AttendanceFilterModal({
  isOpen,
  onClose,
  onApply,
  initialFilters,
  guards,
}: AttendanceFilterModalProps) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? new Date(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? new Date(initialFilters.endDate) : undefined
  );
  const [selectedGuardId, setSelectedGuardId] = useState<string>(initialFilters.guardId || '');

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
      guardId: selectedGuardId,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectedGuardId('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-lg w-full max-w-md p-6 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">Filter Attendance</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Guard Selection */}
          <div>
            <Label htmlFor="guard">Guard</Label>
            <select
              id="guard"
              value={selectedGuardId}
              onChange={e => setSelectedGuardId(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            >
              <option value="" className="bg-card">All Guards</option>
              {guards.map(guard => (
                <option key={guard.id} value={guard.id} className="bg-card">
                  {guard.name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <Label htmlFor="start-date">Start Date</Label>
            <DatePicker
              date={startDate}
              setDate={setStartDate}
              maxDate={endDate}
              className="mt-1"
            />
          </div>

          {/* End Date */}
          <div>
            <Label htmlFor="end-date">End Date</Label>
            <DatePicker
              date={endDate}
              setDate={setEndDate}
              minDate={startDate}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex space-x-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={handleClear} type="button">
            Clear
          </Button>
          <Button className="flex-1" onClick={handleApply} type="button">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
