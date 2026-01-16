'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';
import { Serialized } from '@/lib/utils';
import { Department, Office } from '@prisma/client';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: { startDate?: Date; endDate?: Date; departmentId?: string; officeId?: string }) => void;
  departments: Serialized<Department>[];
  offices: Serialized<Office>[];
  initialFilters: {
    startDate?: string;
    endDate?: string;
    departmentId?: string;
    officeId?: string;
  };
};

export default function EmployeeFilterModal({ isOpen, onClose, onApply, departments, offices, initialFilters }: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [departmentId, setDepartmentId] = useState<string | undefined>(initialFilters.departmentId);
  const [officeId, setOfficeId] = useState<string | undefined>(initialFilters.officeId);

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
      departmentId,
      officeId,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setDepartmentId(undefined);
    setOfficeId(undefined);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Employees">
      <div className="flex flex-col justify-between p-4 min-h-96">
        <div className="space-y-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Join Date Range</label>
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
                  minDate={startDate} // End date cannot be before start date
                  dateFormat="yyyy-MM-dd"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/50"
                  placeholderText="End Date"
                />
              </div>
            </div>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Department</label>
            <select
              value={departmentId || ''}
              onChange={e => setDepartmentId(e.target.value || undefined)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* Office Filter */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Office</label>
            <select
              value={officeId || ''}
              onChange={e => setOfficeId(e.target.value || undefined)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
            >
              <option value="">All Offices</option>
              {offices.map(office => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
            </select>
          </div>
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