'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import { Serialized } from '@/lib/utils';
import { Site, Guard } from '@prisma/client';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';
import Select from '../../components/select'; // Import the custom Select component

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: { startDate?: Date; endDate?: Date; siteId: string; guardId: string }) => void;
  initialFilters: {
    startDate?: string;
    endDate?: string;
    siteId?: string;
    guardId?: string;
  };
  sites: Serialized<Site>[];
  guards: Serialized<Guard>[];
};

export default function ShiftFilterModal({ isOpen, onClose, onApply, initialFilters, sites, guards }: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [siteId, setSiteId] = useState<string>(initialFilters.siteId || '');
  const [guardId, setGuardId] = useState<string>(initialFilters.guardId || '');

  const siteOptions = [{ value: '', label: 'All Sites' }, ...sites.map(site => ({ value: site.id, label: site.name }))];
  const guardOptions = [
    { value: '', label: 'All Guards' },
    ...guards.map(guard => ({ value: guard.id, label: guard.name })),
  ];

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
    setStartDate(undefined);
    setEndDate(undefined);
    setSiteId('');
    setGuardId('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Shifts">
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
                maxDate={endDate} // Start date cannot be after end date
                dateFormat="yyyy-MM-dd"
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
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
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                placeholderText="End Date"
              />
            </div>
          </div>
        </div>

        {/* Site Filter */}
        <div>
          <label htmlFor="filter-site" className="block text-sm font-medium text-foreground mb-1">
            Site
          </label>
          <Select
            id="filter-site"
            instanceId="filter-site"
            options={siteOptions}
            value={siteOptions.find(option => option.value === siteId)}
            onChange={selectedOption => setSiteId(selectedOption ? selectedOption.value : '')}
            placeholder="All Sites"
            isClearable={false} // Since "All Sites" is an option, clearing isn't necessary.
          />
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
            isClearable={false} // Since "All Guards" is an option, clearing isn't necessary.
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
              className="px-4 py-2 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 rounded-lg bg-foreground text-background font-bold text-sm hover:opacity-90 transition-colors shadow-sm"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
