'use client';

import { createOfficeShift, updateOfficeShift } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateOfficeShiftInput } from '@repo/validations';
import { useActionState, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { EmployeeSummary } from '@repo/database';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from '../../components/select';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

type Props = {
  officeShift?: {
    id: string;
    officeShiftTypeId: string;
    employeeId: string;
    date: string;
    startsAt: string;
    endsAt: string;
    status: string;
    note?: string | null;
  };
  officeShiftTypes: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
  }[];
  employees: EmployeeSummary[];
};

export default function OfficeShiftForm({ officeShift, officeShiftTypes, employees }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateOfficeShiftInput>, FormData>(
    officeShift ? updateOfficeShift.bind(null, officeShift.id) : createOfficeShift,
    { success: false }
  );
  const [date, setDate] = useState<Date | null>(officeShift?.date ? new Date(officeShift.date) : new Date());
  const [selectedOfficeShiftTypeId, setSelectedOfficeShiftTypeId] = useState<string>(officeShift?.officeShiftTypeId || '');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(officeShift?.employeeId || '');

  const isReadOnly = officeShift ? officeShift.status !== 'scheduled' : false;

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (officeShift ? 'Office Shift updated successfully!' : 'Office Shift created successfully!'));
      router.push('/admin/office-shifts');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, officeShift, router]);

  const employeeOptions = employees.map(employee => ({
    value: employee.id,
    label: employee.fullName,
    employeeNumber: employee.employeeNumber ?? '',
  }));
  const officeShiftTypeOptions = officeShiftTypes.map(item => ({
    value: item.id,
    label: `${item.name} (${item.startTime} - ${item.endTime})`,
  }));

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {isReadOnly ? 'View Office Shift' : officeShift ? 'Edit Office Shift' : 'Schedule Office Shift'}
      </h1>
      <form action={formAction} className="space-y-8">
        <div>
          <label htmlFor="officeShiftTypeId" className="block font-medium text-foreground mb-1">
            Office Shift Type
          </label>
          <Select
            id="office-shift-type-select"
            instanceId="office-shift-type-select"
            options={officeShiftTypeOptions}
            value={officeShiftTypeOptions.find(opt => opt.value === selectedOfficeShiftTypeId) || null}
            onChange={option => setSelectedOfficeShiftTypeId(option?.value || '')}
            placeholder="Select an office shift type"
            isClearable={false}
            isSearchable={false}
            isDisabled={isReadOnly}
          />
          <input type="hidden" name="officeShiftTypeId" value={selectedOfficeShiftTypeId} />
          {state.errors?.officeShiftTypeId && <p className="text-red-500 text-xs mt-1">{state.errors.officeShiftTypeId[0]}</p>}
        </div>

        <div>
          <label htmlFor="employeeId" className="block font-medium text-foreground mb-1">
            Employee
          </label>
          <Select
            id="office-employee-select"
            instanceId="office-employee-select"
            options={employeeOptions}
            value={employeeOptions.find(opt => opt.value === selectedEmployeeId) || null}
            onChange={option => setSelectedEmployeeId(option?.value || '')}
            placeholder="Select an office employee"
            isClearable={!isReadOnly}
            isDisabled={isReadOnly}
            filterOption={(option, inputValue) => {
              const search = inputValue.toLowerCase();
              return option.data.label.toLowerCase().includes(search) || option.data.employeeNumber.toLowerCase().includes(search);
            }}
            formatOptionLabel={(option, { context }) =>
              context === 'value' ? (
                <span>{option.label}</span>
              ) : (
                <div className="flex items-center gap-2">
                  <span>{option.label}</span>
                  {option.employeeNumber && <span className="text-muted-foreground">({option.employeeNumber})</span>}
                </div>
              )
            }
          />
          <input type="hidden" name="employeeId" value={selectedEmployeeId} />
          {state.errors?.employeeId && <p className="text-red-500 text-xs mt-1">{state.errors.employeeId[0]}</p>}
        </div>

        <div>
          <label htmlFor="date" className="block font-medium text-foreground mb-1">
            Date
          </label>
          <input type="hidden" name="date" value={date ? format(date, 'yyyy-MM-dd') : ''} />
          <DatePicker
            selected={date}
            onChange={d => setDate(d)}
            dateFormat="yyyy-MM-dd"
            minDate={new Date()}
            disabled={isReadOnly}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
            wrapperClassName="w-full"
          />
          {state.errors?.date && <p className="text-red-500 text-xs mt-1">{state.errors.date[0]}</p>}
        </div>

        <div>
          <label htmlFor="note" className="block font-medium text-foreground mb-1">
            Note
          </label>
          <textarea
            name="note"
            id="note"
            defaultValue={officeShift?.note || ''}
            rows={3}
            disabled={isReadOnly}
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground resize-none"
            placeholder="Add any special instructions or notes for this office shift..."
          />
        </div>

        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 text-red-600 text-sm border border-red-100">{state.message}</div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/office-shifts')}
            className="px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </button>
          {!isReadOnly && (
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Saving...' : officeShift ? 'Save Changes' : 'Schedule Office Shift'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
