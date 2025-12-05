'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import { Serialized } from '@/lib/utils';
import { Site, Guard } from '@prisma/client';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: {
    startDate: Date | null;
    endDate: Date | null;
    siteId: string;
    guardId: string;
  }) => void;
  initialFilters: {
    startDate?: string;
    endDate?: string;
    siteId?: string;
    guardId?: string;
  };
  sites: Serialized<Site>[];
  guards: Serialized<Guard>[];
};

export default function ShiftFilterModal({
  isOpen,
  onClose,
  onApply,
  initialFilters,
  sites,
  guards,
}: Props) {
  const [startDate, setStartDate] = useState<Date | null>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : null
  );
  const [endDate, setEndDate] = useState<Date | null>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : null
  );
  const [siteId, setSiteId] = useState<string>(initialFilters.siteId || '');
  const [guardId, setGuardId] = useState<string>(initialFilters.guardId || '');

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
      siteId,
      guardId,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(null);
    setEndDate(null);
    setSiteId('');
    setGuardId('');
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Shifts">
      <div className="space-y-4 p-4">
        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => setStartDate(date)}
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
                onChange={(date: Date | null) => setEndDate(date)}
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

        {/* Site Filter */}
        <div>
          <label htmlFor="filter-site" className="block text-sm font-medium text-gray-700 mb-1">
            Site
          </label>
          <select
            id="filter-site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all bg-white text-sm"
          >
            <option value="">All Sites</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </div>

        {/* Guard Filter */}
        <div>
          <label htmlFor="filter-guard" className="block text-sm font-medium text-gray-700 mb-1">
            Guard
          </label>
          <select
            id="filter-guard"
            value={guardId}
            onChange={(e) => setGuardId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all bg-white text-sm"
          >
            <option value="">All Guards</option>
            {guards.map((guard) => (
              <option key={guard.id} value={guard.id}>
                {guard.name}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-6">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear Filters
          </button>
          <div className="flex gap-2">
             <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors shadow-sm"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
