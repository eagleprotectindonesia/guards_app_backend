'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import Select from '../../components/select';

type LeaveRequestFilterModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onApply: (filters: {
    statuses: string[];
    reasons: string[];
    categories: string[];
    employeeId?: string;
    startDate?: Date;
    endDate?: Date;
  }) => void;
  initialFilters: {
    statuses: string[];
    reasons: string[];
    categories: string[];
    employeeId?: string;
    startDate?: string;
    endDate?: string;
  };
  employees: Array<{
    id: string;
    fullName: string;
    employeeNumber: string | null;
  }>;
};

type SelectOption = {
  value: string;
  label: string;
};

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
] satisfies SelectOption[];

const CATEGORY_OPTIONS = [
  { value: 'sick', label: 'Sick' },
  { value: 'family', label: 'Family' },
  { value: 'special', label: 'Special' },
  { value: 'annual', label: 'Annual' },
] satisfies SelectOption[];

const REASON_OPTIONS = [
  { value: 'sick', label: 'Sick Leave' },
  { value: 'family_marriage', label: 'Marriage Leave' },
  { value: 'family_child_marriage', label: 'Child Marriage' },
  { value: 'family_child_circumcision_baptism', label: 'Child Circumcision/Baptism' },
  { value: 'family_death', label: 'Death of Family Member' },
  { value: 'family_spouse_death', label: 'Spouse Death' },
  { value: 'special_maternity', label: 'Maternity Leave' },
  { value: 'special_miscarriage', label: 'Miscarriage Leave' },
  { value: 'special_paternity', label: 'Paternity Leave' },
  { value: 'special_emergency', label: 'Emergency Leave' },
  { value: 'annual', label: 'Annual Leave' },
] satisfies SelectOption[];

export default function LeaveRequestFilterModal({
  isOpen,
  onClose,
  onApply,
  initialFilters,
  employees,
}: LeaveRequestFilterModalProps) {
  const [statuses, setStatuses] = useState<string[]>(initialFilters.statuses);
  const [reasons, setReasons] = useState<string[]>(initialFilters.reasons);
  const [categories, setCategories] = useState<string[]>(initialFilters.categories);
  const [employeeId, setEmployeeId] = useState<string>(initialFilters.employeeId || '');
  const [startDate, setStartDate] = useState<Date | undefined>(
    initialFilters.startDate ? new Date(initialFilters.startDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    initialFilters.endDate ? new Date(initialFilters.endDate) : undefined
  );

  const employeeOptions = useMemo(
    () =>
      employees.map(employee => ({
        value: employee.id,
        label: `${employee.fullName}${employee.employeeNumber ? ` (${employee.employeeNumber})` : ''}`,
      })),
    [employees]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-xl shadow-lg w-full max-w-md p-6 border border-border space-y-4">
        <div>
          <h3 className="text-lg font-bold text-foreground">Filter Leave Requests</h3>
          <p className="text-xs text-muted-foreground mt-1">Filter by status, employee, and date range.</p>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            isMulti
            options={STATUS_OPTIONS}
            value={STATUS_OPTIONS.filter(option => statuses.includes(option.value))}
            onChange={selected => {
              const selectedValues = Array.isArray(selected)
                ? (selected as SelectOption[]).map(option => option.value)
                : [];
              setStatuses(selectedValues.length > 0 ? selectedValues : ['pending']);
            }}
            placeholder="Select status"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            isMulti
            options={CATEGORY_OPTIONS}
            value={CATEGORY_OPTIONS.filter(option => categories.includes(option.value))}
            onChange={selected => {
              const selectedValues = Array.isArray(selected)
                ? (selected as SelectOption[]).map(option => option.value)
                : [];
              setCategories(selectedValues);
            }}
            placeholder="All categories"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Leave Type</Label>
          <Select
            isMulti
            options={REASON_OPTIONS}
            value={REASON_OPTIONS.filter(option => reasons.includes(option.value))}
            onChange={selected => {
              const selectedValues = Array.isArray(selected)
                ? (selected as SelectOption[]).map(option => option.value)
                : [];
              setReasons(selectedValues);
            }}
            placeholder="All leave types"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Employee</Label>
          <Select
            options={employeeOptions}
            value={employeeOptions.find(option => option.value === employeeId) || null}
            onChange={selected => {
              const selectedOption = selected as SelectOption | null;
              setEmployeeId(selectedOption?.value || '');
            }}
            isClearable
            placeholder="All employees"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>Start Date</Label>
          <DatePicker date={startDate} setDate={setStartDate} maxDate={endDate} />
        </div>

        <div className="space-y-2">
          <Label>End Date</Label>
          <DatePicker date={endDate} setDate={setEndDate} minDate={startDate} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setStatuses(['pending']);
              setReasons([]);
              setCategories([]);
              setEmployeeId('');
              setStartDate(undefined);
              setEndDate(undefined);
            }}
            type="button"
          >
            Clear
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply({
                statuses,
                reasons,
                categories,
                employeeId: employeeId || undefined,
                startDate,
                endDate,
              });
              onClose();
            }}
            type="button"
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
