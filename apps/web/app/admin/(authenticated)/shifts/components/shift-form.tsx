'use client';

import { Serialized } from '@/lib/utils';
import { createShift, updateShift } from '../actions';
import { ActionState } from '@/types/actions';
import { CreateShiftInput } from '@/lib/validations';
import { useActionState, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Shift, Site, ShiftType, Guard } from '@prisma/client';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import Select from '../../components/select';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';

type Props = {
  shift?: Serialized<Shift>;
  sites: Serialized<Site>[];
  shiftTypes: Serialized<ShiftType>[];
  guards: Serialized<Guard>[];
};

export default function ShiftForm({ shift, sites, shiftTypes, guards }: Props) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState<CreateShiftInput>, FormData>(
    shift ? updateShift.bind(null, shift.id) : createShift,
    { success: false }
  );

  const [date, setDate] = useState<Date | null>(shift?.date ? new Date(shift.date) : new Date());
  const [selectedShiftTypeId, setSelectedShiftTypeId] = useState<string>(shift?.shiftTypeId || '');
  const [selectedSiteId, setSelectedSiteId] = useState<string>(shift?.siteId || '');
  const [selectedGuardId, setSelectedGuardId] = useState<string>(shift?.guardId || '');

  const isReadOnly = shift ? shift.status !== 'scheduled' : false;

  useEffect(() => {
    if (state.success) {
      toast.success(state.message || (shift ? 'Shift updated successfully!' : 'Shift created successfully!'));
      router.push('/admin/shifts');
    } else if (state.message && !state.success) {
      toast.error(state.message);
    }
  }, [state, shift, router]);

  const siteOptions = sites.map(site => ({ value: site.id, label: site.name }));
  const guardOptions = guards.map(guard => ({ value: guard.id, label: guard.name })).slice(0, 8);
  const shiftTypeOptions = shiftTypes.map(st => ({
    value: st.id,
    label: `${st.name} (${st.startTime} - ${st.endTime})`,
  }));

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {isReadOnly ? 'View Shift' : shift ? 'Edit Shift' : 'Schedule New Shift'}
      </h1>
      <form action={formAction} className="space-y-8">
        {/* Site Field */}
        <div>
          <label htmlFor="siteId" className="block font-medium text-foreground mb-1">
            Site
          </label>
          <Select
            id="site-select"
            instanceId="site-select"
            options={siteOptions}
            value={siteOptions.find(opt => opt.value === selectedSiteId) || null}
            onChange={option => setSelectedSiteId(option?.value || '')}
            placeholder="Select a site..."
            isClearable={!isReadOnly}
            isDisabled={isReadOnly}
          />
          <input type="hidden" name="siteId" value={selectedSiteId} />
          {state.errors?.siteId && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.siteId[0]}</p>}
        </div>

        {/* Shift Type Field */}
        <div>
          <label htmlFor="shiftTypeId" className="block font-medium text-foreground mb-1">
            Shift Type
          </label>
          <Select
            id="shift-type-select"
            instanceId="shift-type-select"
            options={shiftTypeOptions}
            value={shiftTypeOptions.find(opt => opt.value === selectedShiftTypeId) || null}
            onChange={option => setSelectedShiftTypeId(option?.value || '')}
            placeholder="Select a shift type"
            isClearable={false}
            isSearchable={false}
            isDisabled={isReadOnly}
          />
          <input type="hidden" name="shiftTypeId" value={selectedShiftTypeId} />
          {state.errors?.shiftTypeId && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.shiftTypeId[0]}</p>}
        </div>

        {/* Guard Field */}
        <div>
          <label htmlFor="guardId" className="block font-medium text-foreground mb-1">
            Guard
          </label>
          <Select
            id="guard-select"
            instanceId="guard-select"
            options={guardOptions}
            value={guardOptions.find(opt => opt.value === selectedGuardId) || null}
            onChange={option => setSelectedGuardId(option?.value || '')}
            placeholder="Unassigned"
            isClearable={!isReadOnly}
            isDisabled={isReadOnly}
          />
          <input type="hidden" name="guardId" value={selectedGuardId} />
        </div>

        {/* Date Field */}
        <div>
          <label htmlFor="date" className="block font-medium text-foreground mb-1">
            Date
          </label>
          {/* Hidden input for formatted date string YYYY-MM-DD */}
          <input type="hidden" name="date" value={date ? format(date, 'yyyy-MM-dd') : ''} />
          <DatePicker
            selected={date}
            onChange={d => setDate(d)}
            dateFormat="yyyy-MM-dd"
            minDate={new Date()}
            disabled={isReadOnly}
            className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
            wrapperClassName="w-full"
          />
          {state.errors?.date && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.date[0]}</p>}
        </div>

        {/* Config Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="requiredCheckinIntervalMins" className="block font-medium text-foreground mb-1">
              Interval (min)
            </label>
            <input
              type="number"
              name="requiredCheckinIntervalMins"
              id="requiredCheckinIntervalMins"
              defaultValue={shift?.requiredCheckinIntervalMins || 20}
              min={5}
              disabled={isReadOnly}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
            />
            {state.errors?.requiredCheckinIntervalMins && (
              <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.requiredCheckinIntervalMins[0]}</p>
            )}
          </div>

          <div>
            <label htmlFor="graceMinutes" className="block font-medium text-foreground mb-1">
              Grace Period (min)
            </label>
            <input
              type="number"
              name="graceMinutes"
              id="graceMinutes"
              defaultValue={shift?.graceMinutes || 2}
              min={1}
              disabled={isReadOnly}
              className="w-full h-10 px-3 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all disabled:bg-muted disabled:text-muted-foreground"
            />
            {state.errors?.graceMinutes && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.graceMinutes[0]}</p>}
          </div>
        </div>

        {/* Note Field */}
        <div>
          <label htmlFor="note" className="block font-medium text-foreground mb-1">
            Note
          </label>
          <textarea
            name="note"
            id="note"
            defaultValue={shift?.note || ''}
            rows={3}
            disabled={isReadOnly}
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-foreground focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none transition-all resize-none disabled:bg-muted disabled:text-muted-foreground placeholder:text-muted-foreground/50"
            placeholder="Add any special instructions or notes for this shift..."
          />
          {state.errors?.note && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{state.errors.note[0]}</p>}
        </div>

        {/* Error Message */}
        {state.message && !state.success && (
          <div className="p-3 rounded bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border border-red-100 dark:border-red-900/50">{state.message}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => router.push('/admin/shifts')}
            className="px-6 py-2.5 rounded-lg border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-colors"
          >
            {isReadOnly ? 'Back' : 'Cancel'}
          </button>
          {!isReadOnly && (
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:bg-red-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/30"
            >
              {isPending ? 'Saving...' : shift ? 'Save Changes' : 'Schedule Shift'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
