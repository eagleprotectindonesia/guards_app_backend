'use client';

import { useState } from 'react';
import Modal from '../../components/modal';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO } from 'date-fns';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: { startDate?: Date; endDate?: Date; action?: string; entityType?: string }) => void;
  initialFilters: {
    startDate?: string | null;
    endDate?: string | null;
    action?: string | null;
    entityType?: string | null;
  };
  hideEntityType?: boolean;
};

export default function ChangelogFilterModal({ 
  isOpen, 
  onClose, 
  onApply, 
  initialFilters,
  hideEntityType 
}: Props) {
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? parseISO(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? parseISO(initialFilters.endDate) : undefined
  );
  const [action, setAction] = useState<string>(initialFilters.action || '');
  const [entityType, setEntityType] = useState<string>(initialFilters.entityType || '');

  const handleApply = () => {
    onApply({
      startDate,
      endDate,
      action,
      entityType,
    });
    onClose();
  };

  const handleClear = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setAction('');
    setEntityType('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Filter Audit Logs">
      <div className="flex flex-col justify-between p-4 min-h-[400px]">
        <div className="space-y-4">
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
                  isClearable={true}
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
                  isClearable={true}
                  dateFormat="yyyy-MM-dd"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm placeholder:text-muted-foreground/50"
                  placeholderText="End Date"
                />
              </div>
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Action</label>
            <select 
              className="w-full h-10 px-3 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="" className="bg-card">All Actions</option>
              <option value="CREATE" className="bg-card">Create</option>
              <option value="UPDATE" className="bg-card">Update</option>
              <option value="DELETE" className="bg-card">Delete</option>
              <option value="BULK_CREATE" className="bg-card">Bulk Create</option>
            </select>
          </div>

          {/* Entity Type */}
          {!hideEntityType && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Entity Type</label>
              <select
                className="w-full h-10 px-3 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              >
                <option value="" className="bg-card">All Entities</option>
                <option value="Employee" className="bg-card">Employee</option>
                <option value="Site" className="bg-card">Site</option>
                <option value="Shift" className="bg-card">Shift</option>
                <option value="Alert" className="bg-card">Alert</option>
              </select>
            </div>
          )}
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
