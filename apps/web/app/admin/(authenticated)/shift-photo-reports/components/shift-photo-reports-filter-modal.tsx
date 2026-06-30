'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { X } from 'lucide-react';

type StatusOption = { value: string; label: string };

type ShiftPhotoReportsFilterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: {
    dateFrom?: Date;
    dateTo?: Date;
    employeeId: string;
    siteId: string;
    status: string;
  }) => void;
  initialFilters: {
    dateFrom?: string;
    dateTo?: string;
    employeeId?: string;
    siteId?: string;
    status?: string;
  };
  employees: { id: string; fullName: string }[];
  sites: { id: string; name: string }[];
  statusOptions: StatusOption[];
};

export default function ShiftPhotoReportsFilterModal({
  isOpen,
  onClose,
  onApply,
  initialFilters,
  employees,
  sites,
  statusOptions,
}: ShiftPhotoReportsFilterModalProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    initialFilters.dateFrom ? new Date(initialFilters.dateFrom) : undefined
  );
  const [dateTo, setDateTo] = useState<Date | undefined>(
    initialFilters.dateTo ? new Date(initialFilters.dateTo) : undefined
  );
  const [employeeId, setEmployeeId] = useState(initialFilters.employeeId || '');
  const [siteId, setSiteId] = useState(initialFilters.siteId || '');
  const [status, setStatus] = useState(initialFilters.status || '');

  const handleApply = () => {
    onApply({
      dateFrom,
      dateTo,
      employeeId,
      siteId,
      status,
    });
    onClose();
  };

  const handleClear = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setEmployeeId('');
    setSiteId('');
    setStatus('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-lg w-full max-w-md p-6 border border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-foreground">Filter Shift Photo Reports</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="filter-employee">Employee</Label>
            <select
              id="filter-employee"
              value={employeeId}
              onChange={e => setEmployeeId(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            >
              <option value="" className="bg-card">All Employees</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id} className="bg-card">
                  {employee.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="filter-site">Site</Label>
            <select
              id="filter-site"
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            >
              <option value="" className="bg-card">All Sites</option>
              {sites.map(site => (
                <option key={site.id} value={site.id} className="bg-card">
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="filter-status">Status</Label>
            <select
              id="filter-status"
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
            >
              <option value="" className="bg-card">All Statuses</option>
              {statusOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-card">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="filter-date-from">Start Date</Label>
            <DatePicker
              date={dateFrom}
              setDate={setDateFrom}
              maxDate={dateTo}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="filter-date-to">End Date</Label>
            <DatePicker
              date={dateTo}
              setDate={setDateTo}
              minDate={dateFrom}
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
