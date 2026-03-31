'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';
import Select from '../../components/select';
import type { EmployeeSummary } from '@repo/database';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: { startDate?: Date; endDate?: Date; employeeId: string }) => void;
  initialFilters: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
  };
  employees: EmployeeSummary[];
};

export default function OfficeShiftFilterModal({ isOpen, onClose, onApply, initialFilters, employees }: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [employeeId, setEmployeeId] = useState<string>(initialFilters.employeeId || '');

  const employeeOptions = [
    { value: '', label: 'All Employees' },
    ...employees.map(employee => ({ value: employee.id, label: employee.fullName })),
  ];

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
      employeeId,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setEmployeeId('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Office Shifts">
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
                minDate={startDate}
                dateFormat="yyyy-MM-dd"
                className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all text-sm"
                placeholderText="End Date"
              />
            </div>
          </div>
        </div>

        {/* Employee Filter */}
        <div>
          <label htmlFor="filter-employee" className="block text-sm font-medium text-foreground mb-1">
            Employee
          </label>
          <Select
            id="filter-employee"
            instanceId="filter-employee"
            options={employeeOptions}
            value={employeeOptions.find(option => option.value === employeeId)}
            onChange={selectedOption => setEmployeeId(selectedOption ? selectedOption.value : '')}
            placeholder="All Employees"
            isClearable={false}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-6">
          <button
            type="button"
            onClick={handleClear}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
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
