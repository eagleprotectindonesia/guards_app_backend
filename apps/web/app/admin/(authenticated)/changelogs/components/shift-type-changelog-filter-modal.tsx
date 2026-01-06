'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';
import { Serialized } from '@/lib/utils';
import { ShiftType } from '@prisma/client';
import Select from '../../components/select';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: { startDate?: Date; endDate?: Date; action?: string; entityId?: string }) => void;
  initialFilters: {
    startDate?: string | null;
    endDate?: string | null;
    action?: string | null;
    entityId?: string | null;
  };
  shiftTypes?: Serialized<ShiftType>[];
};

export default function ShiftTypeChangelogFilterModal({ 
  isOpen, 
  onClose, 
  onApply, 
  initialFilters,
  shiftTypes = []
}: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [action, setAction] = useState<string>(initialFilters.action || '');
  const [entityId, setEntityId] = useState<string>(initialFilters.entityId || '');

  const shiftTypeOptions = [
    { value: '', label: 'All Shift Types' },
    ...shiftTypes.map(st => ({ value: st.id, label: st.name })),
  ];

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
      action,
      entityId,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setAction('');
    setEntityId('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Shift Type Audit Logs">
      <div className="flex flex-col justify-between p-4 min-h-[350px]">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker
                selected={startDate}
                onChange={date => setStartDate(date as Date)}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                isClearable={true}
                dateFormat="yyyy-MM-dd"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                placeholderText="Start Date"
              />
              <DatePicker
                selected={endDate}
                onChange={date => setEndDate(date as Date)}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate}
                isClearable={true}
                dateFormat="yyyy-MM-dd"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                placeholderText="End Date"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift Type</label>
            <Select
              options={shiftTypeOptions}
              value={shiftTypeOptions.find(opt => opt.value === entityId)}
              onChange={(val) => setEntityId(val?.value || '')}
              placeholder="All Shift Types"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select 
              className="w-full h-10 px-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between pt-6">
          <button type="button" onClick={handleClear} className="text-sm text-gray-500 hover:text-gray-700 underline">
            Clear Filters
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleApply} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors shadow-sm">
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
