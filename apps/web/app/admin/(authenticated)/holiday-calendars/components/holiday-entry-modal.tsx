'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export type HolidayType = 'holiday' | 'week_off' | 'emergency' | 'special_working_day';
export type HolidayScope = 'all' | 'department';

export type HolidayEntry = {
  id: string;
  startDate: string;
  endDate: string;
  title: string;
  type: HolidayType;
  scope: HolidayScope;
  departmentKeys: string[];
  isPaid: boolean;
  affectsAttendance: boolean;
  notificationRequired: boolean;
  note: string | null;
};

const TYPE_OPTIONS: Array<{ value: HolidayType; label: string }> = [
  { value: 'holiday', label: 'Holiday' },
  { value: 'week_off', label: 'Week Off' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'special_working_day', label: 'Special Working Day' },
];

interface HolidayEntryModalProps {
  entry: HolidayEntry | null;
  selectedDate: Date;
  departmentOptions: string[];
  onClose: () => void;
  onSubmit: (entryId: string | null, formData: FormData) => void;
}

export default function HolidayEntryModal({
  entry,
  selectedDate,
  departmentOptions,
  onClose,
  onSubmit,
}: HolidayEntryModalProps) {
  const [scope, setScope] = useState<HolidayScope>(entry?.scope || 'all');
  const [startDate, setStartDate] = useState<Date | undefined>(
    entry?.startDate ? parseISO(entry.startDate) : selectedDate
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    entry?.endDate ? parseISO(entry.endDate) : selectedDate
  );
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(
    entry?.departmentKeys.map(k => k.toLowerCase().trim()) || []
  );

  const toggleDepartment = (dept: string) => {
    const key = dept.toLowerCase().trim();
    setSelectedDepartments(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>{entry ? 'Edit Holiday Entry' : 'Create Holiday Entry'}</DialogTitle>
        </DialogHeader>

        <form
          action={formData => {
            formData.delete('departmentKeys');
            if (scope === 'department') {
              selectedDepartments.forEach(value => formData.append('departmentKeys', value));
            }
            if (startDate) formData.set('startDate', format(startDate, 'yyyy-MM-dd'));
            if (endDate) formData.set('endDate', format(endDate, 'yyyy-MM-dd'));
            
            onSubmit(entry?.id || null, formData);
          }}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Start Date</Label>
              <DatePicker date={startDate} setDate={setStartDate} className="w-full" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">End Date</Label>
              <DatePicker date={endDate} setDate={setEndDate} className="w-full" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Title</Label>
            <input
              type="text"
              name="title"
              required
              defaultValue={entry?.title || ''}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="e.g. Eid Holiday, Rain Emergency"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Type</Label>
              <select
                name="type"
                defaultValue={entry?.type || 'holiday'}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {TYPE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Applies To</Label>
              <select
                name="scope"
                value={scope}
                onChange={event => {
                  const value = event.target.value as HolidayScope;
                  setScope(value);
                  if (value === 'all') setSelectedDepartments([]);
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="all">All Employees</option>
                <option value="department">Specific Departments</option>
              </select>
            </div>
          </div>

          {scope === 'department' && (
            <div className="space-y-3">
              <Label className="text-muted-foreground">Select Departments</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 border rounded-lg bg-muted/30 max-h-48 overflow-y-auto">
                {departmentOptions.map(option => {
                  const key = option.toLowerCase().trim();
                  const isChecked = selectedDepartments.includes(key);
                  return (
                    <div key={option} className="flex items-center space-x-2">
                      <Checkbox
                        id={`dept-${key}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleDepartment(option)}
                      />
                      <Label
                        htmlFor={`dept-${key}`}
                        className="text-xs font-normal cursor-pointer truncate"
                        title={option}
                      >
                        {option}
                      </Label>
                    </div>
                  );
                })}
              </div>
              {selectedDepartments.length === 0 && (
                <p className="text-[10px] text-destructive">Please select at least one department.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-2">
            <div className="flex items-center space-x-2">
              <input type="hidden" name="isPaid" value="false" />
              <Checkbox
                id="isPaid"
                name="isPaid"
                value="true"
                defaultChecked={entry?.isPaid ?? true}
              />
              <Label htmlFor="isPaid" className="cursor-pointer">Is Paid</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input type="hidden" name="affectsAttendance" value="false" />
              <Checkbox
                id="affectsAttendance"
                name="affectsAttendance"
                value="true"
                defaultChecked={entry?.affectsAttendance ?? true}
              />
              <Label htmlFor="affectsAttendance" className="cursor-pointer">Affects Attendance</Label>
            </div>
            <div className="flex items-center space-x-2">
              <input type="hidden" name="notificationRequired" value="false" />
              <Checkbox
                id="notificationRequired"
                name="notificationRequired"
                value="true"
                defaultChecked={entry?.notificationRequired ?? false}
              />
              <Label htmlFor="notificationRequired" className="cursor-pointer">Notify Employees</Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Administrative Note</Label>
            <textarea
              name="note"
              defaultValue={entry?.note || ''}
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder="Internal notes about this holiday..."
            />
          </div>

          <DialogFooter className="pt-4 border-t gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={scope === 'department' && selectedDepartments.length === 0}
            >
              {entry ? 'Update Holiday' : 'Create Holiday'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
