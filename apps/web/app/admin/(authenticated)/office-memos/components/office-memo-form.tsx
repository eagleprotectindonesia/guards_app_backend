'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addMonths, format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ActionState } from '@/types/actions';
import { OfficeMemoInput } from '@repo/validations';
import { createOfficeMemoAction, updateOfficeMemoAction } from '../actions';
import { SerializedOfficeMemoWithAdminInfoDto } from '@/types/office-memos';

type Props = {
  officeMemo?: SerializedOfficeMemoWithAdminInfoDto;
  departmentOptions: string[];
};

export default function OfficeMemoForm({ officeMemo, departmentOptions }: Props) {
  const isEditMode = Boolean(officeMemo);
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<OfficeMemoInput>, FormData>(
    officeMemo ? updateOfficeMemoAction.bind(null, officeMemo.id) : createOfficeMemoAction,
    { success: false }
  );

  const [scope, setScope] = useState<'all' | 'department'>(officeMemo?.scope || 'all');
  const [startDate, setStartDate] = useState<Date | undefined>(
    officeMemo?.startDate ? parseISO(officeMemo.startDate) : new Date()
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    officeMemo?.endDate ? parseISO(officeMemo.endDate) : addMonths(new Date(), 1)
  );
  const [hasUserSetEndDate, setHasUserSetEndDate] = useState<boolean>(isEditMode);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    officeMemo?.departmentKeys.map(value => value.toLowerCase().trim()) || []
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (officeMemo ? 'Office memo updated successfully.' : 'Office memo created successfully.'));
      router.push('/admin/office-memos');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [officeMemo, router, state]);

  const toggleDepartment = (dept: string) => {
    const key = dept.toLowerCase().trim();
    setSelectedDepartments(prev => (prev.includes(key) ? prev.filter(value => value !== key) : [...prev, key]));
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">{officeMemo ? 'Edit Office Memo' : 'Create Office Memo'}</h1>

      <form
        action={formData => {
          formData.delete('departmentKeys');
          if (scope === 'department') {
            selectedDepartments.forEach(value => formData.append('departmentKeys', value));
          }

          if (startDate) formData.set('startDate', format(startDate, 'yyyy-MM-dd'));
          if (endDate) formData.set('endDate', format(endDate, 'yyyy-MM-dd'));

          formAction(formData);
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Start Date</Label>
            <DatePicker
              date={startDate}
              setDate={nextDate => {
                setStartDate(nextDate);
                if (!isEditMode && !hasUserSetEndDate && nextDate) {
                  setEndDate(addMonths(nextDate, 1));
                }
              }}
              className="w-full"
            />
            {state.errors?.startDate && <p className="text-red-500 text-xs mt-1">{state.errors.startDate[0]}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">End Date</Label>
            <DatePicker
              date={endDate}
              setDate={nextDate => {
                setHasUserSetEndDate(true);
                setEndDate(nextDate);
              }}
              className="w-full"
            />
            {state.errors?.endDate && <p className="text-red-500 text-xs mt-1">{state.errors.endDate[0]}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Title</Label>
          <input
            type="text"
            name="title"
            required
            defaultValue={officeMemo?.title || ''}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none"
            placeholder="e.g. Uniform reminder"
          />
          {state.errors?.title && <p className="text-red-500 text-xs mt-1">{state.errors.title[0]}</p>}
        </div>

        <div className="space-y-2">
          <Label className="text-muted-foreground">Message</Label>
          <textarea
            name="message"
            defaultValue={officeMemo?.message || ''}
            rows={4}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none resize-none"
            placeholder="Memo details..."
          />
          {state.errors?.message && <p className="text-red-500 text-xs mt-1">{state.errors.message[0]}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Applies To</Label>
            <select
              name="scope"
              value={scope}
              onChange={event => {
                const nextScope = event.target.value as 'all' | 'department';
                setScope(nextScope);
                if (nextScope === 'all') setSelectedDepartments([]);
              }}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground"
            >
              <option value="all">All Employees</option>
              <option value="department">Specific Departments</option>
            </select>
            {state.errors?.scope && <p className="text-red-500 text-xs mt-1">{state.errors.scope[0]}</p>}
          </div>

          <div className="flex items-end pb-1">
            <div className="flex items-center space-x-2">
              <input type="hidden" name="isActive" value="false" />
              <Checkbox id="isActive" name="isActive" value="true" defaultChecked={officeMemo?.isActive ?? true} />
              <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
            </div>
          </div>
        </div>

        {scope === 'department' && (
          <div className="space-y-3">
            <Label className="text-muted-foreground">Select Departments</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 border rounded-lg bg-muted/30 max-h-52 overflow-y-auto">
              {departmentOptions.map(option => {
                const key = option.toLowerCase().trim();
                const isChecked = selectedDepartments.includes(key);
                return (
                  <div key={option} className="flex items-center space-x-2">
                    <Checkbox id={`dept-${key}`} checked={isChecked} onCheckedChange={() => toggleDepartment(option)} />
                    <Label htmlFor={`dept-${key}`} className="text-xs font-normal cursor-pointer truncate" title={option}>
                      {option}
                    </Label>
                  </div>
                );
              })}
            </div>
            {(state.errors?.departmentKeys?.[0] || selectedDepartments.length === 0) && (
              <p className="text-red-500 text-xs mt-1">{state.errors?.departmentKeys?.[0] || 'Please select at least one department.'}</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/office-memos')}
            className="px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || (scope === 'department' && selectedDepartments.length === 0)}
            className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving...' : officeMemo ? 'Save Changes' : 'Create Memo'}
          </button>
        </div>
      </form>
    </div>
  );
}
