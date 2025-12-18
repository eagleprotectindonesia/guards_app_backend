'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: { startDate?: Date; endDate?: Date }) => void;
  initialFilters: {
    startDate?: string;
    endDate?: string;
  };
};

export default function GuardFilterModal({ isOpen, onClose, onApply, initialFilters }: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Guards">
      <div className="flex flex-col justify-between p-4 min-h-96">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Join Date Range</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <DatePicker
                selected={startDate}
                onChange={date => setStartDate(date as Date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                maxDate={endDate} // Start date cannot be after end date
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
                minDate={startDate} // End date cannot be before start date
                dateFormat="yyyy-MM-dd"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                placeholderText="End Date"
              />
            </div>
          </div>
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
