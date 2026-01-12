'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import { Serialized } from '@/lib/utils';
import { Guard } from '@prisma/client';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';
import Select from '../../components/select';

type Props = {
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

export default function CheckinFilterModal({ isOpen, onClose, onApply, initialFilters, guards }: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [guardId, setGuardId] = useState<string>(initialFilters.guardId || '');

  const guardOptions = [
    { value: '', label: 'All Guards' },
    ...guards.map(guard => ({ value: guard.id, label: guard.name })),
  ];

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
      guardId,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setGuardId('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Check-ins">
      <div className="space-y-4 p-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Date Range</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <DatePicker
                selected={startDate}
                onChange={date => setStartDate(date as Date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                maxDate={endDate}
                dateFormat="yyyy-MM-dd"
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/50"
                placeholderText="Start Date"
              />
            </div>
            <div>
              <DatePicker
                selected={endDate}
                onChange={date => setEndDate(date as Date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate}
                dateFormat="yyyy-MM-dd"
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/50"
                placeholderText="End Date"
              />
            </div>
          </div>
        </div>

        {/* Guard Filter */}
        <div>
          <label htmlFor="filter-guard" className="block text-sm font-medium text-foreground mb-1">
            Guard
          </label>
          <Select
            id="filter-guard"
            instanceId="filter-guard"
            options={guardOptions}
            value={guardOptions.find(option => option.value === guardId)}
            onChange={selectedOption => setGuardId(selectedOption ? selectedOption.value : '')}
            placeholder="All Guards"
            isClearable={false}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-6">
          <button type="button" onClick={handleClear} className="text-sm text-muted-foreground hover:text-foreground underline">
            Clear Filters
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border text-foreground font-bold text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 rounded-lg bg-foreground text-background font-bold text-sm hover:bg-foreground/90 transition-colors shadow-sm"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
