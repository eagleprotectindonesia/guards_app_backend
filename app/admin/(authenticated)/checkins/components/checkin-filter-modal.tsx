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
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
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
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
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
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                placeholderText="End Date"
              />
            </div>
          </div>
        </div>

        {/* Guard Filter */}
        <div>
          <label htmlFor="filter-guard" className="block text-sm font-medium text-gray-700 mb-1">
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
          <button type="button" onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Clear Filters
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition-colors shadow-sm"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
